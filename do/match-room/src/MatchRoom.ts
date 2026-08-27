import { buildMatchConfig, createSparringMatch, restoreSparringMatch, type SparringMatch } from '@ks/competition'
import { type MatchConfig, type MatchState, type StoredProtocolEntry } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import migrationsBundle from '../drizzle/migrations.js'
import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import {
  type CreateBody,
  CreateBodySchema,
  type MatchIdBody,
  MatchIdBodySchema,
  type StreamBody,
  StreamBodySchema,
  type SubmitCommandBody,
  SubmitCommandBodySchema,
  type SubmitCommandResult,
} from './rpc-contract'
import { type ActiveMatchRecord, ActiveMatchStore } from './storage/active-match-store'
import type { CommandReceiptOutcome } from './storage/command-outcome'

type ResidentRoom = { readonly latestSeq: number; readonly match: SparringMatch }
type Failure = { ok: false; error: string; status: number }

export class MatchRoom extends DurableObject<Env> {
  private readonly store: ActiveMatchStore
  private readonly live = new Broadcaster()
  private readonly ready: Promise<void>
  private resident: ResidentRoom | null = null
  private storageDeleted = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.store = new ActiveMatchStore(ctx.storage)
    this.ready = ctx.blockConcurrencyWhile(async () => {
      migrate(this.store.db, migrationsBundle)
    })
  }

  async create(args: CreateBody): Promise<{ ok: true; matchId: MatchConfig['matchId'] } | Failure> {
    await this.ready
    const parsed = v.safeParse(CreateBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid create body', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      const config = buildMatchConfig(parsed.output.matchId, parsed.output)
      const existing = this.store.match()
      if (existing) {
        if (
          existing.matchId !== config.matchId ||
          existing.controlSecret !== parsed.output.controlSecret ||
          JSON.stringify(existing.config) !== JSON.stringify(config) ||
          existing.createdAt !== parsed.output.createdAt
        )
          return { ok: false, error: 'Match already exists', status: 409 }
      } else {
        this.store.commitCreation({
          matchId: config.matchId,
          controlSecret: parsed.output.controlSecret,
          configJson: JSON.stringify(config),
          createdAt: parsed.output.createdAt,
        })
        this.resident = { latestSeq: 0, match: createSparringMatch(config) }
      }
      return { ok: true, matchId: config.matchId }
    })
  }

  async readControl(args: MatchIdBody): Promise<
    | {
        ok: true
        latestSeq: number
        state: MatchState
        controlProjection?: unknown
        controlSections: ReturnType<SparringMatch['project']>['controlSections']
      }
    | Failure
  > {
    await this.ready
    const match = this.activeMatch(args, 'control')
    if ('ok' in match) return match
    const projection = this.loadResident(match).match.project()
    return { ok: true, latestSeq: match.latestSeq, ...projection }
  }

  async readProtocol(
    args: MatchIdBody,
  ): Promise<{ ok: true; latestSeq: number; state: MatchState; protocolEntries: StoredProtocolEntry[] } | Failure> {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid protocol body', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      const match = this.activeMatch(parsed.output, 'protocol')
      if ('ok' in match) return match
      return {
        ok: true,
        latestSeq: match.latestSeq,
        state: this.loadResident(match).match.project().state,
        protocolEntries: this.store.protocolEntriesThrough(match.latestSeq),
      }
    })
  }

  async submitCommand(args: SubmitCommandBody): Promise<SubmitCommandResult> {
    await this.ready
    const body = v.safeParse(SubmitCommandBodySchema, args)
    if (!body.success) return { ok: false, error: 'invalid-command-body', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      const match = this.store.match()
      if (!match || match.matchId !== body.output.matchId) return { ok: false, error: 'unknown-match', status: 400 }
      const requestJson = JSON.stringify(body.output.command)
      const prior = this.store.commandOutcome(body.output.command.commandId)
      if (prior)
        return prior.requestJson === requestJson
          ? this.success(prior.outcome, match.status)
          : { ok: false, error: 'command-id-conflict', status: 409 }
      if (match.status === 'finalizing') return { ok: false, error: 'match-locked', status: 409 }
      const resident = this.loadResident(match)
      try {
        const result = resident.match.execute(body.output.command)
        if (result._tag === 'parse-failed') return { ok: false, error: 'invalid-command-body', status: 400 }
        if (result._tag === 'rejected')
          return this.success(
            this.store.commitRejected({
              matchId: match.matchId,
              commandId: body.output.command.commandId,
              requestJson,
              reason: result.reason,
            }),
            match.status,
          )
        const projection = resident.match.project()
        const finalState = projection.state.status === 'finished' ? projection.state : null
        const committed = this.store.commitAccepted({
          match,
          commandId: body.output.command.commandId,
          requestJson,
          command: result.command,
          entries: result.protocolEntries,
          finalState,
        })
        this.resident = { latestSeq: committed.outcome.acceptedSeq, match: resident.match }
        if (!committed.update.terminal) this.live.broadcast(committed.update)
        return this.success(committed.outcome, committed.update.terminal ? 'finalizing' : 'active')
      } catch (error) {
        this.resident = null
        throw error
      }
    })
  }

  async stream(args: StreamBody): Promise<Response> {
    await this.ready
    const parsed = v.safeParse(StreamBodySchema, args)
    if (!parsed.success) return Response.json({ ok: false, error: 'Invalid stream body' }, { status: 400 })
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId)
      return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    const publicSeq = match.status === 'finalizing' ? match.latestSeq - 1 : match.latestSeq
    return this.live.stream(publicSeq, this.store.liveUpdatesAfter(parsed.output.since ?? 0, publicSeq))
  }

  async finalization(args: MatchIdBody): Promise<
    | {
        ok: true
        data: {
          matchId: MatchConfig['matchId']
          gameKey: string
          createdAt: number
          sourceLatestSeq: number
          endedAt: number
          protocolEntries: StoredProtocolEntry[]
          finalState: MatchState
        }
      }
    | Failure
  > {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid finalize body', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status !== 'finalizing' || !match.finalState || match.endedAt === null)
      return { ok: false, error: 'Match is active', status: 409 }
    const entries = this.store.protocolEntriesThrough(match.latestSeq)
    this.validateTerminal(match, entries)
    return {
      ok: true,
      data: {
        matchId: match.matchId,
        gameKey: match.config.gameKey,
        createdAt: match.createdAt,
        sourceLatestSeq: match.latestSeq,
        endedAt: match.endedAt,
        protocolEntries: entries,
        finalState: match.finalState,
      },
    }
  }

  async disposeFinalized(args: MatchIdBody): Promise<{ ok: true } | Failure> {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid dispose body', status: 400 }
    if (!this.env.MATCH_ROOM.idFromName(parsed.output.matchId).equals(this.ctx.id))
      return { ok: false, error: 'Unknown match', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.storageDeleted) return { ok: true }
      const match = this.store.match()
      if (!match) return { ok: true }
      if (match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
      if (match.status !== 'finalizing' || !match.finalState || match.endedAt === null)
        return { ok: false, error: 'Match is active', status: 409 }
      const entries = this.store.protocolEntriesThrough(match.latestSeq)
      this.validateTerminal(match, entries)
      const terminalEntries = entries
        .filter((entry) => entry.acceptedSeq === match.latestSeq)
        .map((entry) => ({
          frameIndex: entry.frameIndex,
          source: entry.source,
          entryType: entry.entryType,
          seat: entry.seat,
          scoreAfter: entry.scoreAfter,
          body: JSON.parse(entry.bodyJson),
        }))
      if (!terminalEntries[0]) throw new Error('Missing terminal Protocol entries')
      this.live.broadcast({
        type: 'command-accepted',
        acceptedSeq: match.latestSeq,
        entries: [terminalEntries[0], ...terminalEntries.slice(1)],
        terminal: true,
      })
      this.live.closeAll()
      await this.ctx.storage.deleteAll()
      this.storageDeleted = true
      this.resident = null
      return { ok: true }
    })
  }

  private activeMatch(args: MatchIdBody, kind: string): ActiveMatchRecord | Failure {
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: `Invalid ${kind} body`, status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status === 'finalizing') return { ok: false, error: 'Match is finalizing', status: 409 }
    return match
  }

  private loadResident(match: ActiveMatchRecord): ResidentRoom {
    if (this.resident?.latestSeq === match.latestSeq) return this.resident
    const resident = restoreSparringMatch(match.config, this.store.history(match))
    return (this.resident = { latestSeq: match.latestSeq, match: resident })
  }

  private success(
    outcome: CommandReceiptOutcome,
    status: ActiveMatchRecord['status'],
  ): Extract<SubmitCommandResult, { ok: true }> {
    return status === 'finalizing' && outcome._tag === 'accepted'
      ? { ok: true, outcome, finalizing: true }
      : { ok: true, outcome }
  }

  private validateTerminal(match: ActiveMatchRecord, entries: StoredProtocolEntry[]): void {
    const terminal = entries.filter((entry) => entry.entryType === 'match-ended')
    const tail = entries.at(-1)
    const winner = [...(match.finalState?.frames ?? [])].reverse().find((frame) => frame.winnerSeat)?.winnerSeat
    if (
      !tail ||
      terminal.length !== 1 ||
      tail !== terminal[0] ||
      tail.acceptedSeq !== match.latestSeq ||
      tail.acceptedAt !== match.endedAt ||
      tail.seat !== winner
    )
      throw new Error('MatchRoom terminal storage corruption')
  }
}
