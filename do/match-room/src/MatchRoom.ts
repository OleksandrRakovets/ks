import { applyMatchFact, buildMatchConfig, emptyMatchState, type MatchState } from '@ks/competition'
import {
  type AcceptedFact,
  type ClientFact,
  ClientIdSchema,
  type CommandId,
  type ControlCommand,
  type MatchConfig,
  newFactId,
  nowUnixEpochMilliseconds,
  opponentOf,
  SeatSchema,
  type StoredFact,
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
  deriveActiveGameSummary,
  type RoomSnapshotSuccess,
} from './active-game'
import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import {
  type CreateBody,
  CreateBodySchema,
  type FactsBody,
  FactsBodySchema,
  type SnapshotBody,
  SnapshotBodySchema,
  type StreamBody,
  StreamBodySchema,
} from './rpc-contract'
import { ActiveMatchStore } from './storage/store'

type RoomState = { matchState: MatchState; currentFrame: AnyActiveGameState | null }
type SnapshotResult = RoomSnapshotSuccess | { ok: false; error: string; status: number }
const ConcedeFrameCommandSchema = v.object({ seat: SeatSchema })
const CommenceFrameCommandSchema = v.object({ seat: SeatSchema })
const ServerClientId = v.parse(ClientIdSchema, 'server0000')

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
        this.commitAccepted(this.initialFacts(config), null, {
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

  async facts(
    args: FactsBody,
  ): Promise<
    | { ok: true; accepted: AcceptedFact[]; finalizing?: true }
    | { ok: false; error: 'invalid-facts-body' | 'unknown-match' | 'match-locked'; status: number }
  > {
    await this.ready
    const parsed = v.safeParse(FactsBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'invalid-facts-body', status: 400 }
    return await this.ctx.blockConcurrencyWhile(async () => {
      if (this.deleted) return { ok: false, error: 'match-locked', status: 409 }
      const match = this.store.match()
      if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'unknown-match', status: 400 }
      const requestJson = JSON.stringify(parsed.output.command)
      const previous = this.store.receipt(parsed.output.commandId)
      if (match.status === 'finalizing') {
        if (previous?.requestJson === requestJson) return { ok: true, accepted: previous.accepted, finalizing: true }
        return { ok: false, error: 'match-locked', status: 409 }
      }
      if (previous) {
        if (previous.requestJson !== requestJson) {
          return { ok: false, error: 'invalid-facts-body', status: 409 }
        }
        return {
          ok: true,
          accepted: previous.accepted,
        }
      }

      const state = this.loadState()
      let facts: ClientFact[] = []
      try {
        facts = this.factsForCommand(state, parsed.output.command)
      } catch {
        /* rejected gameplay intent produces no facts */
      }

      const committed = this.commitAccepted(facts, { commandId: parsed.output.commandId, requestJson })
      return committed.storedFacts.some((fact) => fact.type === 'match.ended')
        ? { ok: true, accepted: committed.accepted, finalizing: true }
        : { ok: true, accepted: committed.accepted }
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
  ): Promise<{ ok: true; facts: StoredFact[] } | { ok: false; error: string; status: number }> {
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
    | { ok: true; data: { sourceLatestSeq: number; endedAt: UnixEpochMilliseconds; facts: StoredFact[] } }
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

  private initialFacts(config: MatchConfig): ClientFact[] {
    const base = {
      matchId: config.matchId,
      clientId: ServerClientId,
      clientSeq: 0,
      at: nowUnixEpochMilliseconds(),
    }
    const created: ClientFact = { ...base, factId: newFactId(), type: 'match.created', payload: config }
    const started: ClientFact = {
      ...base,
      factId: newFactId(),
      type: 'frame.started',
      payload: {
        frameIndex: 1,
        gameKey: config.gameKey,
        targetPointsBySeat: config.targets.frameTargetPointsBySeat,
        breakerSeat: config.firstBreakerSeat,
        gameConfiguration: config.gameConfiguration,
      },
    }
    return [created, started]
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

  private commitAccepted(
    facts: ClientFact[],
    receipt: { commandId: CommandId; requestJson: string } | null,
    initialization?: {
      matchId: MatchConfig['matchId']
      controlSecret: string
      configJson: string
      createdAt: UnixEpochMilliseconds
    },
  ): { accepted: AcceptedFact[]; storedFacts: StoredFact[] } {
    const committed = initialization
      ? this.store.commitAccepted({ facts, receipt, initialization })
      : this.store.commitAccepted({ facts, receipt })
    const state = this.loadState()
    for (const fact of committed.storedFacts) {
      if (fact.type !== 'match.ended') this.live.broadcast(fact)
    }
    this.cache = { latestSeq: this.store.match()?.latestSeq ?? 0, state }
    return committed
  }

  private apply(room: RoomState, fact: ClientFact): RoomState {
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

  private factsForCommand(room: RoomState, command: ControlCommand): ClientFact[] {
    const config = room.matchState.config
    if (!config) throw new Error('Missing match config')
    const base = {
      matchId: config.matchId,
      clientId: ServerClientId,
      clientSeq: 0,
      at: nowUnixEpochMilliseconds(),
    }
    if (command.source === 'match' && command.commandType === 'frame.start') {
      const frameIndex = room.matchState.currentFrameIndex + 1
      return [
        {
          ...base,
          factId: newFactId(),
          type: 'frame.started',
          payload: {
            frameIndex,
            gameKey: config.gameKey,
            targetPointsBySeat: config.targets.frameTargetPointsBySeat,
            breakerSeat: this.breakerSeat(config, frameIndex),
            gameConfiguration: config.gameConfiguration,
          },
        },
      ]
    }
    if (command.source === 'match' && command.commandType === 'match.end') {
      const winnerSeat = this.matchWinner(config, room.matchState)
      if (!winnerSeat) throw new Error('Cannot end match before target')
      return [{ ...base, factId: newFactId(), type: 'match.ended', payload: { winnerSeat } }]
    }
    if (room.currentFrame === null) throw new Error('No active frame')
    const frame = room.matchState.frames.at(-1)
    if (!frame || frame.winnerSeat) throw new Error('No active frame')
    if (command.source === 'match' && command.commandType === 'frame.commence') {
      const commence = v.parse(CommenceFrameCommandSchema, command.command)
      if (commence.seat !== frame.breakerSeat) throw new Error('Frame break-off seat does not match match order')
      const result = applyActiveGameCommand(room.currentFrame, 'frame.commence', commence)
      return [
        {
          ...base,
          factId: newFactId(),
          type: 'game.command',
          payload: {
            frameIndex: frame.frameIndex,
            gameKey: config.gameKey,
            commandType: 'frame.commence',
            command: commence,
            protocolEntries: result.protocolEntries,
          },
        },
      ]
    }
    if (command.source === 'game') {
      const result = applyActiveGameCommand(room.currentFrame, command.commandType, command.command)
      const game: ClientFact = {
        ...base,
        factId: newFactId(),
        type: 'game.command',
        payload: {
          frameIndex: frame.frameIndex,
          gameKey: config.gameKey,
          commandType: command.commandType,
          command: command.command,
          protocolEntries: result.protocolEntries,
        },
      }
      return result.outcome
        ? [
            game,
            {
              ...base,
              factId: newFactId(),
              type: 'frame.completed',
              payload: { frameIndex: frame.frameIndex, gameKey: config.gameKey, outcome: result.outcome },
            },
          ]
        : [game]
    }
    if (command.source === 'match' && command.commandType === 'frame.concede') {
      const concede = v.parse(ConcedeFrameCommandSchema, command.command)
      const projection = deriveActiveGameSummary(room.currentFrame)
      return [
        {
          ...base,
          factId: newFactId(),
          type: 'frame.completed',
          payload: {
            frameIndex: frame.frameIndex,
            gameKey: config.gameKey,
            outcome: { winnerSeat: opponentOf(concede.seat), score: projection.score, winReason: 'conceded' },
          },
        },
      ]
    }
    throw new Error('Unsupported command')
  }

  private matchWinner(config: MatchConfig, matchState: MatchState): 'A' | 'B' | null {
    if (matchState.framesWonBySeat.A >= config.targets.matchTargetFrames) return 'A'
    if (matchState.framesWonBySeat.B >= config.targets.matchTargetFrames) return 'B'
    return null
  }

  private breakerSeat(config: MatchConfig, frameIndex: number): 'A' | 'B' {
    return frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
  }
}
