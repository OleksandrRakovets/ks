import {
  buildMatchConfig,
  createSparringMatch,
  restoreSparringMatch,
  type SparringMatch,
} from '@ks/competition'
import { type MatchConfig, type MatchState, type ProtocolEntry } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'
import * as v from 'valibot'

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
import { type ActiveMatchRecord, type CommandReceipt, MatchStorage } from './storage/match-storage'

type ResidentRoom = { readonly latestSeq: number; readonly match: SparringMatch }
type Failure = { ok: false; error: string; status: number }

export class MatchRoom extends DurableObject<Env> {
  private readonly store: MatchStorage
  private readonly live = new Broadcaster()
  private readonly ready: Promise<void>
  private resident: ResidentRoom | null = null
  private storageDeleted = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.store = new MatchStorage(ctx.storage)
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.store.migrate()
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
          config,
          controlSecret: parsed.output.controlSecret,
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
  ): Promise<{ ok: true; latestSeq: number; state: MatchState; protocolEntries: ProtocolEntry[] } | Failure> {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid protocol body', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      const match = this.activeMatch(parsed.output, 'protocol')
      if ('ok' in match) return match
      const protocol = this.store.readProtocol()
      return {
        ok: true,
        latestSeq: protocol.latestSeq,
        state: this.loadResident(match).match.project().state,
        protocolEntries: protocol.protocolEntries,
      }
    })
  }

  async submitCommand(args: SubmitCommandBody): Promise<SubmitCommandResult> {
    await this.ready
    const body = v.safeParse(SubmitCommandBodySchema, args)
    if (!body.success) return { ok: false, error: 'invalid-command-body', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      const match = this.store.match()
      if (!match || match.matchId !== body.output.matchId)
        return { ok: false, error: 'unknown-match', status: 400 }
      const prior = this.store.findCommandReceipt(body.output.command)
      if (prior)
        return prior._tag === 'retry'
          ? this.success(prior.receipt, match.status)
          : { ok: false, error: 'command-id-conflict', status: 409 }
      if (match.status === 'finalizing') return { ok: false, error: 'match-locked', status: 409 }
      const resident = this.loadResident(match)
      try {
        const result = resident.match.execute(body.output.command)
        if (result._tag === 'parse-failed') return { ok: false, error: 'invalid-command-body', status: 400 }
        if (result._tag === 'rejected')
          return this.success(
            this.store.commitRejectedCommand({
              matchId: match.matchId,
              command: body.output.command,
              reason: result.reason,
            }),
            match.status,
          )
        const projection = resident.match.project()
        const finalState = projection.state.status === 'finished' ? projection.state : null
        const committed = this.store.commitAcceptedCommand({
          match,
          command: result.command,
          entryContents: result.protocolEntryContents,
          finalState,
        })
        this.resident = { latestSeq: committed.receipt.acceptedSeq, match: resident.match }
        if (!committed.update.terminal) this.live.broadcast(committed.update)
        return this.success(committed.receipt, committed.update.terminal ? 'finalizing' : 'active')
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
          protocolEntries: ProtocolEntry[]
          finalState: MatchState
        }
      }
    | Failure
  > {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid finalize body', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId)
      return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status !== 'finalizing' || !match.finalState || match.endedAt === null)
      return { ok: false, error: 'Match is active', status: 409 }
    return { ok: true, data: this.store.readFinalizingTransfer() }
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
      this.store.readFinalizingTransfer()
      this.live.broadcast({
        type: 'command-accepted',
        acceptedSeq: match.latestSeq,
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
    if (!match || match.matchId !== parsed.output.matchId)
      return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status === 'finalizing') return { ok: false, error: 'Match is finalizing', status: 409 }
    return match
  }

  private loadResident(match: ActiveMatchRecord): ResidentRoom {
    if (this.resident?.latestSeq === match.latestSeq) return this.resident
    const resident = restoreSparringMatch(match.config, this.store.readAcceptedCommandHistory())
    return (this.resident = { latestSeq: match.latestSeq, match: resident })
  }

  private success(
    receipt: CommandReceipt,
    status: ActiveMatchRecord['status'],
  ): Extract<SubmitCommandResult, { ok: true }> {
    return status === 'finalizing' && receipt._tag === 'accepted'
      ? { ok: true, outcome: receipt, finalizing: true }
      : { ok: true, outcome: receipt }
  }
}
