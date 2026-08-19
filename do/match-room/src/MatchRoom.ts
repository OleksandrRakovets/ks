import {
  assignmentsBySeat,
  buildMatchConfig,
  CreateMatchRequestSchema,
  deriveSparringControlSections,
  emptyMatchState,
  snapshotFromMatchState,
  applyMatchFact,
  type MatchState,
} from '@ks/competition'
import {
  BySeatNumberSchema,
  ClientIdSchema,
  MatchIdSchema,
  newFactId,
  opponentOf,
  SeatSchema,
  type ClientFact,
  type ControlCommand,
  type MatchConfig,
} from '@ks/core'
import { applyGameCommand, createInitialGameState, deriveGameProjection, parseGameKey } from '@ks/gameplay/server'
import { DurableObject } from 'cloudflare:workers'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import migrationsBundle from '../drizzle/migrations.js'
import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import {
  CreateBodySchema,
  FactsBodySchema,
  SnapshotBodySchema,
  StreamBodySchema,
  type CreateBody,
  type FactsBody,
  type SnapshotBody,
  type StreamBody,
} from './rpc-contract'
import { ActiveMatchStore } from './storage/store'

type RoomState = { matchState: MatchState; currentFrameState: unknown | null }
type Accepted = { seq: number; factId: string }
const ConcedeFrameCommandSchema = v.object({ seat: SeatSchema })
const CommenceFrameCommandSchema = v.object({ seat: SeatSchema })
const GameScoreProjectionSchema = v.object({ score: BySeatNumberSchema })

export class MatchRoom extends DurableObject<Env> {
  private readonly store: ActiveMatchStore
  private readonly live = new Broadcaster()
  private readonly ready: Promise<void>
  private cache: { latestSeq: number; state: RoomState } | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.store = new ActiveMatchStore(ctx.storage)
    this.ready = ctx.blockConcurrencyWhile(async () => {
      migrate(this.store.db, migrationsBundle)
    })
  }

  async create(
    args: CreateBody,
  ): Promise<{ ok: true; matchId: string; controlSecret: string } | { ok: false; error: string; status: number }> {
    await this.ready
    const parsed = v.safeParse(CreateBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid create body', status: 400 }
    return await this.ctx.blockConcurrencyWhile(async () => {
      if (this.store.match()) return { ok: false, error: 'Match already exists', status: 409 }
      const request = v.safeParse(CreateMatchRequestSchema, parsed.output)
      if (!request.success) return { ok: false, error: 'Invalid create body', status: 400 }
      const config = buildMatchConfig(parsed.output.matchId, request.output)
      const facts = this.initialFacts(parsed.output.matchId, config)
      this.store.create(parsed.output.matchId, parsed.output.controlSecret, JSON.stringify(config))
      const accepted = facts.map((fact, index) => ({ seq: index + 1, factId: fact.factId }))
      this.commitAccepted(facts, accepted, null)
      // Catalog registration is intentionally recoverable rather than falsely cross-store atomic.
      const seats = assignmentsBySeat(request.output.participants)
      await this.env.DB.prepare(
        'INSERT OR IGNORE INTO matches (match_id, game_key, seat_a_player_ref, seat_b_player_ref, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(parsed.output.matchId, config.gameKey, seats.A, seats.B, 'active', Date.now())
        .run()
      return { ok: true, matchId: parsed.output.matchId, controlSecret: parsed.output.controlSecret }
    })
  }

  async snapshot(
    args: SnapshotBody,
  ): Promise<
    | { ok: true; snapshot: unknown; controlProjection: unknown | undefined; controlSections: unknown }
    | { ok: false; error: string; status: number }
  > {
    await this.ready
    if (!v.safeParse(SnapshotBodySchema, args).success) return { ok: false, error: 'Invalid snapshot body', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== args.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    const state = this.loadState()
    if (!state.matchState.config) return { ok: false, error: 'Match is not initialized', status: 409 }
    const controlProjection =
      state.currentFrameState === null
        ? undefined
        : deriveGameProjection({
            gameKey: parseGameKey(state.matchState.config.gameKey),
            state: state.currentFrameState,
            projection: 'control',
          })
    return {
      ok: true,
      snapshot: snapshotFromMatchState(state.matchState, match.latestSeq),
      controlProjection,
      controlSections: deriveSparringControlSections({
        matchState: state.matchState,
        gameControlProjection: controlProjection,
      }),
    }
  }

  async facts(
    args: FactsBody,
  ): Promise<
    | { ok: true; accepted: Accepted[] }
    | { ok: false; error: 'invalid-facts-body' | 'unknown-match' | 'unauthorized' | 'match-locked'; status: number }
  > {
    await this.ready
    const parsed = v.safeParse(FactsBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'invalid-facts-body', status: 400 }
    return await this.ctx.blockConcurrencyWhile(async () => {
      const match = this.store.match()
      if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'unknown-match', status: 400 }
      if (match.controlSecret !== parsed.output.controlSecret) return { ok: false, error: 'unauthorized', status: 401 }
      const requestJson = JSON.stringify(parsed.output.commands)
      const previous = this.store.receipt(parsed.output.commandId)
      if (previous)
        return previous.requestJson === requestJson
          ? { ok: true, accepted: previous.accepted }
          : { ok: false, error: 'invalid-facts-body', status: 409 }
      const state = this.loadState()
      const facts: ClientFact[] = []
      let next = state
      for (const command of parsed.output.commands) {
        try {
          const derived = this.factsForCommand(next, match.matchId, command)
          for (const fact of derived) next = this.apply(next, fact)
          facts.push(...derived)
        } catch {
          /* rejected gameplay intent produces no facts */
        }
      }
      const accepted = facts.map((fact, index) => ({ seq: match.latestSeq + index + 1, factId: fact.factId }))
      this.commitAccepted(facts, accepted, { commandId: parsed.output.commandId, requestJson })
      return { ok: true, accepted }
    })
  }

  async stream(args: StreamBody): Promise<Response> {
    await this.ready
    const parsed = v.safeParse(StreamBodySchema, args)
    if (!parsed.success) return Response.json({ ok: false, error: 'Invalid stream body' }, { status: 400 })
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId)
      return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    return this.live.stream(match.latestSeq, this.store.factsAfter(parsed.output.since ?? 0))
  }

  async factsForProtocol(args: { matchId: string }) {
    const match = this.store.match()
    return !match || match.matchId !== args.matchId ? [] : this.store.factsAfter(0)
  }

  private initialFacts(matchId: string, config: MatchConfig): ClientFact[] {
    const base = {
      matchId: v.parse(MatchIdSchema, matchId),
      clientId: v.parse(ClientIdSchema, 'server0000'),
      clientSeq: 0,
      at: Date.now(),
    }
    // SAFETY: both literals are validated ClientFact shapes generated from the validated match config.
    return [
      { ...base, factId: newFactId(), type: 'match.created', payload: config },
      {
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
      },
    ] as ClientFact[]
  }

  private loadState(): RoomState {
    const match = this.store.match()
    if (!match) return { matchState: emptyMatchState(), currentFrameState: null }
    if (this.cache?.latestSeq === match.latestSeq) return this.cache.state
    let state: RoomState = { matchState: emptyMatchState(), currentFrameState: null }
    for (const fact of this.store.factsAfter(0)) state = this.apply(state, fact)
    this.cache = { latestSeq: match.latestSeq, state }
    return state
  }

  private commitAccepted(
    facts: ClientFact[],
    accepted: Accepted[],
    receipt: { commandId: string; requestJson: string } | null,
  ): void {
    this.store.commit(facts, receipt && { ...receipt, accepted })
    const state = this.loadState()
    for (const fact of this.store.factsAfter((this.store.match()?.latestSeq ?? 0) - facts.length)) this.live.broadcast(fact)
    this.cache = { latestSeq: this.store.match()?.latestSeq ?? 0, state }
  }

  private apply(room: RoomState, fact: ClientFact): RoomState {
    const matchState = applyMatchFact(structuredClone(room.matchState), fact)
    if (fact.type === 'frame.started') {
      const args = { targetPointsBySeat: fact.payload.targetPointsBySeat, breakerSeat: fact.payload.breakerSeat }
      const currentFrameState =
        fact.payload.gameConfiguration === undefined
          ? createInitialGameState(parseGameKey(fact.payload.gameKey), args)
          : createInitialGameState(parseGameKey(fact.payload.gameKey), {
              ...args,
              gameConfiguration: fact.payload.gameConfiguration,
            })
      return { matchState, currentFrameState }
    }
    if (fact.type === 'game.command')
      return {
        matchState,
        currentFrameState: applyGameCommand({
          gameKey: parseGameKey(fact.payload.gameKey),
          state: room.currentFrameState,
          commandType: fact.payload.commandType,
          command: fact.payload.command,
        }).state,
      }
    return { matchState, currentFrameState: fact.type === 'frame.completed' ? null : room.currentFrameState }
  }

  private factsForCommand(room: RoomState, matchId: string, command: ControlCommand): ClientFact[] {
    const config = room.matchState.config
    if (!config) throw new Error('Missing match config')
    const base = {
      matchId: v.parse(MatchIdSchema, matchId),
      clientId: v.parse(ClientIdSchema, 'server0000'),
      clientSeq: 0,
      at: Date.now(),
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
    if (room.currentFrameState === null) throw new Error('No active frame')
    const frame = room.matchState.frames.at(-1)
    if (!frame || frame.winnerSeat) throw new Error('No active frame')
    if (command.source === 'match' && command.commandType === 'frame.commence') {
      const commence = v.parse(CommenceFrameCommandSchema, command.command)
      if (commence.seat !== frame.breakerSeat) throw new Error('Frame break-off seat does not match match order')
      const result = applyGameCommand({
        gameKey: parseGameKey(config.gameKey),
        state: room.currentFrameState,
        commandType: 'frame.commence',
        command: commence,
      })
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
      const result = applyGameCommand({
        gameKey: parseGameKey(config.gameKey),
        state: room.currentFrameState,
        commandType: command.commandType,
        command: command.command,
      })
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
      const projection = v.parse(
        GameScoreProjectionSchema,
        deriveGameProjection({ gameKey: parseGameKey(config.gameKey), state: room.currentFrameState, projection: 'summary' }),
      )
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
