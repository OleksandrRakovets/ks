import type { SparringMatch } from '@ks/competition'
import { type MatchConfig, type MatchState, type MatchStreamUpdate, type ProtocolEntry } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'
import * as v from 'valibot'

import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import { ActiveMatch } from './match/active-match'
import { initializeMatch } from './match/initialize-match'
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

type Failure = { ok: false; error: string; status: number }

export class MatchRoom extends DurableObject<Env> {
  private readonly storage: MatchStorage
  private readonly broadcaster: Broadcaster
  private readonly activeMatch: ActiveMatch
  private storageDeleted = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.storage = new MatchStorage(ctx.storage)
    this.broadcaster = new Broadcaster()
    this.activeMatch = new ActiveMatch(this.storage, this.broadcaster)
    ctx.blockConcurrencyWhile(async () => {
      this.storage.migrate()
    })
  }

  async create(args: CreateBody): Promise<{ ok: true; matchId: MatchConfig['matchId'] } | Failure> {
    const parsed = v.safeParse(CreateBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid create body', status: 400 }
    if (this.ctx.id.name !== parsed.output.matchId)
      throw new Error('MatchRoom routed identity does not match initialization Match')
    const result = initializeMatch(this.storage, parsed.output)
    return result._tag === 'initialized'
      ? { ok: true, matchId: result.matchId }
      : { ok: false, error: 'Match already exists', status: 409 }
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
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid control body', status: 400 }
    if (parsed.output.matchId !== this.ctx.id.name) return { ok: false, error: 'Unknown match', status: 400 }
    const result = this.activeMatch.getControls()
    if (result._tag === 'missing') return { ok: false, error: 'Unknown match', status: 400 }
    if (result._tag === 'finalizing') return { ok: false, error: 'Match is finalizing', status: 409 }
    return { ok: true, latestSeq: result.latestSeq, ...result.projection }
  }

  async readProtocol(
    args: MatchIdBody,
  ): Promise<{ ok: true; latestSeq: number; state: MatchState; protocolEntries: ProtocolEntry[] } | Failure> {
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid protocol body', status: 400 }
    if (parsed.output.matchId !== this.ctx.id.name) return { ok: false, error: 'Unknown match', status: 400 }
    const result = this.activeMatch.getProtocol()
    if (result._tag === 'missing') return { ok: false, error: 'Unknown match', status: 400 }
    if (result._tag === 'finalizing') return { ok: false, error: 'Match is finalizing', status: 409 }
    return {
      ok: true,
      latestSeq: result.latestSeq,
      state: result.state,
      protocolEntries: result.protocolEntries,
    }
  }

  async submitCommand(args: SubmitCommandBody): Promise<SubmitCommandResult> {
    const body = v.safeParse(SubmitCommandBodySchema, args)
    if (!body.success) return { ok: false, error: 'invalid-command-body', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      const match = this.storage.match()
      if (!match || match.matchId !== body.output.matchId)
        return { ok: false, error: 'unknown-match', status: 400 }
      const prior = this.storage.findCommandReceipt(body.output.command)
      if (prior)
        return prior._tag === 'retry'
          ? this.success(prior.receipt, match.status)
          : { ok: false, error: 'command-id-conflict', status: 409 }
      if (match.status === 'finalizing') return { ok: false, error: 'match-locked', status: 409 }
      const resident = this.activeMatch.loadResident(match)
      try {
        const result = resident.match.execute(body.output.command)
        if (result._tag === 'parse-failed') return { ok: false, error: 'invalid-command-body', status: 400 }
        if (result._tag === 'rejected')
          return this.success(
            this.storage.commitRejectedCommand({
              matchId: match.matchId,
              command: body.output.command,
              reason: result.reason,
            }),
            match.status,
          )
        const projection = resident.match.project()
        const finalState = projection.state.status === 'finished' ? projection.state : null
        const committed = this.storage.commitAcceptedCommand({
          match,
          command: result.command,
          entryContents: result.protocolEntryContents,
          finalState,
        })
        this.activeMatch.advanceResidentCursor(committed.receipt.acceptedSeq)
        if (!committed.update.terminal) this.activeMatch.broadcast(committed.update)
        return this.success(committed.receipt, committed.update.terminal ? 'finalizing' : 'active')
      } catch (error) {
        this.activeMatch.clearResident()
        throw error
      }
    })
  }

  async stream(args: StreamBody): Promise<Response> {
    const parsed = v.safeParse(StreamBodySchema, args)
    if (!parsed.success) return Response.json({ ok: false, error: 'Invalid stream body' }, { status: 400 })
    const match = this.storage.match()
    if (!match || match.matchId !== parsed.output.matchId)
      return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    const publicSeq = match.status === 'finalizing' ? match.latestSeq - 1 : match.latestSeq
    return this.broadcaster.stream(publicSeq, liveUpdatesAfter(parsed.output.since ?? 0, publicSeq))
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
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid finalize body', status: 400 }
    const match = this.storage.match()
    if (!match || match.matchId !== parsed.output.matchId)
      return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status !== 'finalizing' || !match.finalState || match.endedAt === null)
      return { ok: false, error: 'Match is active', status: 409 }
    return { ok: true, data: this.storage.readFinalizingTransfer() }
  }

  async disposeFinalized(args: MatchIdBody): Promise<{ ok: true } | Failure> {
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid dispose body', status: 400 }
    if (!this.env.MATCH_ROOM.idFromName(parsed.output.matchId).equals(this.ctx.id))
      return { ok: false, error: 'Unknown match', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.storageDeleted) return { ok: true }
      const match = this.storage.match()
      if (!match) return { ok: true }
      if (match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
      if (match.status !== 'finalizing' || !match.finalState || match.endedAt === null)
        return { ok: false, error: 'Match is active', status: 409 }
      this.storage.readFinalizingTransfer()
      this.broadcaster.broadcast({
        type: 'command-accepted',
        acceptedSeq: match.latestSeq,
        terminal: true,
      })
      this.broadcaster.closeAll()
      await this.ctx.storage.deleteAll()
      this.storageDeleted = true
      this.activeMatch.clearResident()
      return { ok: true }
    })
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

function liveUpdatesAfter(since: number, through: number): MatchStreamUpdate[] {
  const updates: MatchStreamUpdate[] = []
  for (let seq = since + 1; seq <= through; seq += 1)
    updates.push({ type: 'command-accepted', acceptedSeq: seq, terminal: false })
  return updates
}
