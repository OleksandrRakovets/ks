import type { SparringMatch } from '@ks/competition'
import {
  type MatchConfig,
  type MatchState,
  nowUnixEpochMilliseconds,
  type ProtocolEntry,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { DurableObject } from 'cloudflare:workers'
import * as v from 'valibot'

import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import { ActiveMatch } from './match/active-match'
import { FinalizingMatch } from './match/finalizing-match'
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
import { MatchStorage } from './storage/match-storage'

type Failure = { ok: false; error: string; status: number }

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #activeMatch: ActiveMatch
  readonly #finalizingMatch: FinalizingMatch
  #disposedAt: UnixEpochMilliseconds | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#storage = new MatchStorage(ctx.storage)
    this.#broadcaster = new Broadcaster()
    this.#activeMatch = new ActiveMatch(this.#storage, this.#broadcaster)
    this.#finalizingMatch = new FinalizingMatch(this.#storage, this.#broadcaster)
    ctx.blockConcurrencyWhile(async () => {
      this.#storage.migrate()
    })
  }

  async create(args: CreateBody): Promise<{ ok: true; matchId: MatchConfig['matchId'] } | Failure> {
    const parsed = v.safeParse(CreateBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid create body', status: 400 }
    if (this.ctx.id.name !== parsed.output.matchId)
      throw new Error('MatchRoom routed identity does not match initialization Match')
    const result = initializeMatch(this.#storage, parsed.output)
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
    const result = this.#activeMatch.getControls()
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
    const result = this.#activeMatch.getProtocol()
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
    if (body.output.matchId !== this.ctx.id.name) return { ok: false, error: 'unknown-match', status: 400 }
    const result = this.#activeMatch.submitCommand(body.output.command)
    if (result._tag === 'missing') return { ok: false, error: 'unknown-match', status: 400 }
    if (result._tag === 'finalizing') return { ok: false, error: 'match-locked', status: 409 }
    if (result._tag === 'invalid-command') return { ok: false, error: 'invalid-command-body', status: 400 }
    if (result._tag === 'command-id-conflict') return { ok: false, error: 'command-id-conflict', status: 409 }
    return result._tag === 'accepted' && result.finalizing
      ? { ok: true, outcome: result.receipt, finalizing: true }
      : { ok: true, outcome: result.receipt }
  }

  async stream(args: StreamBody): Promise<Response> {
    const parsed = v.safeParse(StreamBodySchema, args)
    if (!parsed.success) return Response.json({ ok: false, error: 'Invalid stream body' }, { status: 400 })
    if (parsed.output.matchId !== this.ctx.id.name)
      return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    const result = this.#activeMatch.stream(parsed.output.since)
    if (result._tag === 'missing') return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    if (result._tag === 'finalizing')
      return Response.json({ ok: false, error: 'Match is finalizing' }, { status: 409 })
    return result.response
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
    if (parsed.output.matchId !== this.ctx.id.name) return { ok: false, error: 'Unknown match', status: 400 }
    const result = this.#finalizingMatch.prepareArchive()
    if (result._tag === 'missing') return { ok: false, error: 'Unknown match', status: 400 }
    if (result._tag === 'active') return { ok: false, error: 'Match is active', status: 409 }
    return { ok: true, data: result.transfer }
  }

  async disposeFinalized(args: MatchIdBody): Promise<{ ok: true } | Failure> {
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid dispose body', status: 400 }
    if (!this.env.MATCH_ROOM.idFromName(parsed.output.matchId).equals(this.ctx.id))
      return { ok: false, error: 'Unknown match', status: 400 }
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.#disposedAt !== null) return { ok: true }
      const result = this.#finalizingMatch.closeForDisposal()
      if (result._tag === 'active') return { ok: false, error: 'Match is active', status: 409 }
      await this.ctx.storage.deleteAll()
      this.#disposedAt = nowUnixEpochMilliseconds()
      this.#activeMatch.clearResident()
      return { ok: true }
    })
  }
}
