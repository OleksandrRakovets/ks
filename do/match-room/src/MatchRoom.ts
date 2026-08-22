import { applyMatchFact, buildMatchConfig, emptyMatchState, type MatchState } from '@ks/competition'
import {
  type CommandId,
  type MatchConfig,
  type MatchFact,
  newFactId,
  nowUnixEpochMilliseconds,
  type StoredMatchFact,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { parseGameKey } from '@ks/gameplay/server'
import { DurableObject } from 'cloudflare:workers'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import migrationsBundle from '../drizzle/migrations.js'
import {
  type AnyActiveGameState,
  applyActiveGameCommand,
  assembleRoomSnapshot,
  createActiveGameState,
  type RoomSnapshotSuccess,
} from './active-game'
import type { Env } from './env'
import { legacyCommandFacts } from './legacy-command-facts'
import { Broadcaster } from './live/broadcaster'
import {
  canonicalCommandJson,
  type CreateBody,
  CreateBodySchema,
  type SnapshotBody,
  SnapshotBodySchema,
  type StreamBody,
  StreamBodySchema,
  type SubmitCommandBody,
  SubmitCommandBodySchema,
  type SubmitCommandResult,
} from './rpc-contract'
import type { CommandReceiptOutcome } from './storage/command-receipt'
import { ActiveMatchStore } from './storage/store'

type RoomState = { matchState: MatchState; currentFrame: AnyActiveGameState | null }
type SnapshotResult = RoomSnapshotSuccess | { ok: false; error: string; status: number }

export class MatchRoom extends DurableObject<Env> {
  private readonly store: ActiveMatchStore
  private readonly live = new Broadcaster()
  private readonly ready: Promise<void>
  private cache: { latestSeq: number; state: RoomState } | null = null
  private deleted = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.store = new ActiveMatchStore(ctx.storage)
    this.ready = ctx.blockConcurrencyWhile(async () => {
      migrate(this.store.db, migrationsBundle)
    })
  }

  async create(
    args: CreateBody,
  ): Promise<{ ok: true; matchId: MatchConfig['matchId'] } | { ok: false; error: string; status: number }> {
    await this.ready
    const parsed = v.safeParse(CreateBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid create body', status: 400 }
    return await this.ctx.blockConcurrencyWhile(async () => {
      const config = buildMatchConfig(parsed.output.matchId, parsed.output)
      const configJson = JSON.stringify(config)
      let match = this.store.match()
      if (match) {
        if (
          match.matchId !== parsed.output.matchId ||
          match.controlSecret !== parsed.output.controlSecret ||
          match.configJson !== configJson ||
          match.createdAt !== parsed.output.createdAt
        ) {
          return { ok: false, error: 'Match already exists', status: 409 }
        }
      } else {
        this.commitCreation(config, {
          matchId: parsed.output.matchId,
          controlSecret: parsed.output.controlSecret,
          configJson,
          createdAt: parsed.output.createdAt,
        })
        match = this.store.match()
      }

      if (!match) throw new Error('Failed to initialize active match')
      return { ok: true, matchId: parsed.output.matchId }
    })
  }

  async snapshot(args: SnapshotBody): Promise<SnapshotResult> {
    await this.ready
    if (!v.safeParse(SnapshotBodySchema, args).success) return { ok: false, error: 'Invalid snapshot body', status: 400 }
    if (this.deleted) return { ok: false, error: 'Unknown match', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== args.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status === 'finalizing') {
      return { ok: false, error: 'Match is finalizing', status: 409 }
    }
    const state = this.loadState()
    if (!state.matchState.config) return { ok: false, error: 'Match is not initialized', status: 409 }
    return assembleRoomSnapshot(state.matchState, state.currentFrame, match.latestSeq)
  }

  async facts(args: SubmitCommandBody): Promise<SubmitCommandResult> {
    await this.ready
    const parsed = v.safeParse(SubmitCommandBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'invalid-command-body', status: 400 }
    return await this.ctx.blockConcurrencyWhile(async () => {
      if (this.deleted) return { ok: false, error: 'match-locked', status: 409 }
      const match = this.store.match()
      if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'unknown-match', status: 400 }

      const requestJson = canonicalCommandJson(parsed.output.command)
      const previous = this.store.receipt(parsed.output.commandId)
      if (previous) {
        if (previous.requestJson !== requestJson) {
          return { ok: false, error: 'command-id-conflict', status: 409 }
        }
        return this.submitSuccess(previous.outcome)
      }

      if (match.status === 'finalizing') {
        return { ok: false, error: 'match-locked', status: 409 }
      }

      const state = this.loadState()
      const facts = legacyCommandFacts(state, parsed.output.command, parsed.output.commandId)
      if (facts === null || facts.length === 0) {
        return { ok: false, error: 'invalid-command-body', status: 400 }
      }

      const committed = this.commitAccepted(this.nonemptyFacts(facts), {
        commandId: parsed.output.commandId,
        requestJson,
      })
      return this.submitSuccess(committed.outcome)
    })
  }

  async stream(args: StreamBody): Promise<Response> {
    await this.ready
    const parsed = v.safeParse(StreamBodySchema, args)
    if (!parsed.success) return Response.json({ ok: false, error: 'Invalid stream body' }, { status: 400 })
    if (this.deleted) return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId)
      return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    if (match.status === 'finalizing') {
      return Response.json({ ok: false, error: 'Match is finalizing' }, { status: 409 })
    }
    return this.live.stream(match.latestSeq, this.store.factsAfter(parsed.output.since ?? 0))
  }

  async listFacts(
    args: SnapshotBody,
  ): Promise<{ ok: true; facts: StoredMatchFact[] } | { ok: false; error: string; status: number }> {
    await this.ready
    const parsed = v.safeParse(SnapshotBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid facts body', status: 400 }
    if (this.deleted) return { ok: false, error: 'Unknown match', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status === 'finalizing') {
      return { ok: false, error: 'Match is finalizing', status: 409 }
    }
    return { ok: true, facts: this.store.factsAfter(0) }
  }

  async finalization(
    args: SnapshotBody,
  ): Promise<
    | { ok: true; data: { sourceLatestSeq: number; endedAt: UnixEpochMilliseconds; facts: StoredMatchFact[] } }
    | { ok: false; error: string; status: number }
  > {
    await this.ready
    const parsed = v.safeParse(SnapshotBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid finalize body', status: 400 }
    if (this.deleted) return { ok: false, error: 'Unknown match', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status !== 'finalizing') return { ok: false, error: 'Match is active', status: 409 }
    const facts = this.store.factsAfter(0)
    const terminalFact = facts.find((fact) => fact.type === 'match.ended')
    if (!terminalFact) throw new Error('Missing terminal fact')
    return {
      ok: true,
      data: { sourceLatestSeq: match.latestSeq, endedAt: terminalFact.receivedAt, facts },
    }
  }

  async disposeFinalized(args: SnapshotBody): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    await this.ready
    const parsed = v.safeParse(SnapshotBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid dispose body', status: 400 }
    return await this.ctx.blockConcurrencyWhile(async () => {
      if (this.deleted) return { ok: true }
      const match = this.store.match()
      if (match && match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
      if (match?.status === 'active') return { ok: false, error: 'Match is active', status: 409 }

      if (match) {
        const terminalFact = this.store.factsAfter(0).find((fact) => fact.type === 'match.ended')
        if (!terminalFact) throw new Error('Missing terminal fact')
        this.live.broadcast(terminalFact)
      }
      this.live.closeAll()
      await this.ctx.storage.deleteAll()
      this.deleted = true
      this.cache = null
      return { ok: true }
    })
  }

  private nonemptyFacts(facts: MatchFact[]): [MatchFact, ...MatchFact[]] {
    if (facts.length === 0) throw new Error('Expected non-empty facts')
    return [facts[0]!, ...facts.slice(1)]
  }

  private submitSuccess(outcome: CommandReceiptOutcome): Extract<SubmitCommandResult, { ok: true }> {
    if (outcome._tag === 'rejected') return { ok: true, outcome }
    if (this.store.match()?.status === 'finalizing') return { ok: true, outcome, finalizing: true }
    return { ok: true, outcome }
  }

  private creationFact(config: MatchConfig): MatchFact {
    return {
      factId: newFactId(),
      matchId: config.matchId,
      occurredAt: nowUnixEpochMilliseconds(),
      causedByCommandId: null,
      type: 'match.created',
      payload: config,
    }
  }

  private loadState(): RoomState {
    const match = this.store.match()
    if (!match) return { matchState: emptyMatchState(), currentFrame: null }
    if (this.cache?.latestSeq === match.latestSeq) return this.cache.state
    let state: RoomState = { matchState: emptyMatchState(), currentFrame: null }
    for (const fact of this.store.factsAfter(0)) state = this.apply(state, fact)
    this.cache = { latestSeq: match.latestSeq, state }
    return state
  }

  private commitCreation(
    config: MatchConfig,
    initialization: {
      matchId: MatchConfig['matchId']
      controlSecret: string
      configJson: string
      createdAt: UnixEpochMilliseconds
    },
  ): StoredMatchFact {
    const storedFact = this.store.commitCreation({ initialization, fact: this.creationFact(config) })
    this.live.broadcast(storedFact)
    this.cache = { latestSeq: 1, state: this.apply({ matchState: emptyMatchState(), currentFrame: null }, storedFact) }
    return storedFact
  }

  private commitAccepted(
    facts: [MatchFact, ...MatchFact[]],
    receipt: { commandId: CommandId; requestJson: string },
  ): { outcome: Extract<CommandReceiptOutcome, { _tag: 'accepted' }>; storedFacts: readonly StoredMatchFact[] } {
    const committed = this.store.commitAccepted({ facts, receipt })
    const state = this.loadState()
    for (const fact of committed.storedFacts) {
      if (fact.type !== 'match.ended') this.live.broadcast(fact)
    }
    this.cache = { latestSeq: this.store.match()?.latestSeq ?? 0, state }
    return committed
  }

  private apply(room: RoomState, fact: MatchFact): RoomState {
    const matchState = applyMatchFact(structuredClone(room.matchState), fact)
    if (fact.type === 'frame.started') {
      const args = { targetPointsBySeat: fact.payload.targetPointsBySeat, breakerSeat: fact.payload.breakerSeat }
      const gameKey = parseGameKey(fact.payload.gameKey)
      const gameArgs =
        fact.payload.gameConfiguration === undefined ? args : { ...args, gameConfiguration: fact.payload.gameConfiguration }
      return { matchState, currentFrame: createActiveGameState(gameKey, gameArgs) }
    }
    if (fact.type === 'game.command') {
      if (!room.currentFrame || room.currentFrame.gameKey !== parseGameKey(fact.payload.gameKey)) {
        throw new Error('Game command does not match active frame')
      }
      return {
        matchState,
        currentFrame: applyActiveGameCommand(room.currentFrame, fact.payload.commandType, fact.payload.command).active,
      }
    }
    return { matchState, currentFrame: fact.type === 'frame.completed' ? null : room.currentFrame }
  }
}
