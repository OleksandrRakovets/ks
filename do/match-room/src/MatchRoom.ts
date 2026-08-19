import { recordCompletedMatchInCatalog, registerActiveMatchInCatalog } from '@ks/application/match-room'
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
  ClientFactSchema,
  ClientIdSchema,
  MatchIdSchema,
  newFactId,
  opponentOf,
  SeatSchema,
  type ClientFact,
  type ControlCommand,
  type MatchConfig,
  type StoredFact,
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
import { ActiveMatchStore, type Accepted } from './storage/store'

type RoomState = { matchState: MatchState; currentFrameState: unknown | null }
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
      const request = v.safeParse(CreateMatchRequestSchema, parsed.output)
      if (!request.success) return { ok: false, error: 'Invalid create body', status: 400 }

      const config = buildMatchConfig(parsed.output.matchId, request.output)
      const configJson = JSON.stringify(config)
      let match = this.store.match()
      if (match) {
        if (
          match.matchId !== parsed.output.matchId ||
          match.controlSecret !== parsed.output.controlSecret ||
          match.configJson !== configJson
        ) {
          return { ok: false, error: 'Match already exists', status: 409 }
        }
      } else {
        const createdAt = Date.now()
        this.commitAccepted(this.initialFacts(parsed.output.matchId, config), null, {
          matchId: parsed.output.matchId,
          controlSecret: parsed.output.controlSecret,
          configJson,
          createdAt,
        })
        match = this.store.match()
      }

      if (!match) throw new Error('Failed to initialize active match')
      const seats = assignmentsBySeat(request.output.participants)
      // Catalog registration is intentionally idempotent and outside the local SQLite transaction.
      // If D1 fails, an identical create retry reuses local state and retries only this operation.
      await registerActiveMatchInCatalog(this.env.DB, {
        matchId: match.matchId,
        gameKey: config.gameKey,
        seatAPlayerRef: seats.A,
        seatBPlayerRef: seats.B,
        createdAt: match.createdAt,
      })

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
      if (previous) {
        if (previous.requestJson !== requestJson) {
          return { ok: false, error: 'invalid-facts-body', status: 409 }
        }
        await this.recordTerminalFacts(this.store.factsForAccepted(previous.accepted))
        return { ok: true, accepted: previous.accepted }
      }

      const state = this.loadState()
      const facts: ClientFact[] = []
      let next = state
      for (const command of parsed.output.commands) {
        try {
          const derived = this.factsForCommand(next, match.matchId, command)
          let commandState = next
          for (const fact of derived) commandState = this.apply(commandState, fact)
          facts.push(...derived)
          next = commandState
        } catch {
          /* rejected gameplay intent produces no facts */
        }
      }

      const committed = this.commitAccepted(facts, { commandId: parsed.output.commandId, requestJson })
      await this.recordTerminalFacts(committed.storedFacts)
      return { ok: true, accepted: committed.accepted }
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

  async listFacts(args: SnapshotBody): Promise<StoredFact[]> {
    await this.ready
    const parsed = v.safeParse(SnapshotBodySchema, args)
    if (!parsed.success) return []
    const match = this.store.match()
    return !match || match.matchId !== parsed.output.matchId ? [] : this.store.factsAfter(0)
  }

  private initialFacts(matchId: string, config: MatchConfig): ClientFact[] {
    const base = {
      matchId: v.parse(MatchIdSchema, matchId),
      clientId: v.parse(ClientIdSchema, 'server0000'),
      clientSeq: 0,
      at: Date.now(),
    }
    return [
      v.parse(ClientFactSchema, { ...base, factId: newFactId(), type: 'match.created', payload: config }),
      v.parse(ClientFactSchema, {
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
      }),
    ]
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
    receipt: { commandId: string; requestJson: string } | null,
    initialization?: { matchId: string; controlSecret: string; configJson: string; createdAt: number },
  ): { accepted: Accepted[]; storedFacts: StoredFact[] } {
    const committed = initialization
      ? this.store.commitAccepted({ facts, receipt, initialization })
      : this.store.commitAccepted({ facts, receipt })
    const state = this.loadState()
    for (const fact of committed.storedFacts) this.live.broadcast(fact)
    this.cache = { latestSeq: this.store.match()?.latestSeq ?? 0, state }
    return committed
  }

  private async recordTerminalFacts(storedFacts: StoredFact[]): Promise<void> {
    const terminalFact = storedFacts.find((fact) => fact.type === 'match.ended')
    if (!terminalFact) return

    await recordCompletedMatchInCatalog(this.env.DB, {
      matchId: terminalFact.matchId,
      sourceLatestSeq: terminalFact.seq,
      facts: this.store.factsAfter(0),
      endedAt: terminalFact.receivedAt,
    })
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
