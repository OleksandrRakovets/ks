import {
  applyMatchFact,
  assignmentsBySeat,
  buildMatchConfig,
  CreateMatchRequestSchema,
  deriveSparringControlSections,
  emptyMatchState,
  snapshotFromMatchState,
  type MatchState,
} from '@ks/competition'
import {
  ClientFactSchema,
  ClientIdSchema,
  ControlCommandSchema,
  BySeatNumberSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  MatchConfigSchema,
  MatchIdSchema,
  MatchSeatAssignmentSchema,
  MatchTargetsSchema,
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
import * as v from 'valibot'

import { prepareProtocolRowsForArchive } from '../../domain/protocol/reader'
import { insertProtocolArchive } from '../../domain/protocol/repo'
import type { Env } from '../env'
import { factExists, getLatestSeq, insertStoredFact, listFactsAfter } from '../repos/facts'
import { getMatch, markMatchEnded, matchExists, setMatchLatestSeq } from '../repos/matches'
import { deleteMatchSnapshot, putLatestMatchSnapshot } from '../repos/snapshots'

const ControlSecretSchema = v.pipe(v.string(), v.minLength(16))

const InitBodySchema = v.object({
  matchId: MatchIdSchema,
  controlSecret: ControlSecretSchema,
  config: MatchConfigSchema,
})

const CreateBodySchema = v.object({
  matchId: MatchIdSchema,
  controlSecret: ControlSecretSchema,
  gameKey: NonEmptyStringSchema,
  targets: MatchTargetsSchema,
  participants: v.tuple([MatchSeatAssignmentSchema, MatchSeatAssignmentSchema]),
})

const FactsBodySchema = v.object({
  matchId: MatchIdSchema,
  controlSecret: ControlSecretSchema,
  commands: v.pipe(v.array(ControlCommandSchema), v.minLength(1)),
})

const SnapshotBodySchema = v.object({
  matchId: MatchIdSchema,
})

const StreamBodySchema = v.object({
  matchId: MatchIdSchema,
  since: v.optional(NonNegativeIntegerSchema),
})

const ConcedeFrameCommandSchema = v.object({ seat: SeatSchema })
const GameScoreProjectionSchema = v.object({ score: BySeatNumberSchema })

type RoomState = {
  matchState: MatchState
  currentFrameState: unknown | null
}

type CachedRoomState = {
  latestSeq: number
  roomState: RoomState
}

/** Returns headers required for a long-lived Server-Sent Events response. */
function sseHeaders(): HeadersInit {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  }
}

export class MatchRoom extends DurableObject<Env> {
  private encoder = new TextEncoder()
  private clients = new Set<{
    controller: ReadableStreamDefaultController<Uint8Array>
    pingTimer: ReturnType<typeof setInterval>
  }>()

  /** Creates the match room and stores the Cloudflare runtime bindings. */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  /** Initializes a newly-created match room with its first accepted facts. */
  async init(args: unknown): Promise<{ ok: true; alreadyInitialized?: true } | { ok: false; error: string; status: number }> {
    const parsed = v.safeParse(InitBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid init body', status: 400 }

    const { matchId, controlSecret, config } = parsed.output
    await this.rememberMatchId(matchId)
    const row = await getMatch(this.env, matchId)
    if (!row) return { ok: false, error: 'Unknown match', status: 400 }
    if (row.control_secret !== controlSecret) return { ok: false, error: 'Unauthorized', status: 401 }

    const latest = await getLatestSeq(this.env, matchId)
    if (latest > 0) {
      const initialFacts = await listFactsAfter(this.env, matchId, 0)
      if (latest >= 2 && initialFacts[0]?.type === 'match.created' && initialFacts[1]?.type === 'frame.started') {
        return { ok: true, alreadyInitialized: true }
      }
      return { ok: false, error: 'Match is partially initialized', status: 409 }
    }

    const now = Date.now()
    const serverClientId = v.parse(ClientIdSchema, 'server0000')
    const base = { matchId, clientId: serverClientId, clientSeq: 0, at: now }

    const created: ClientFact = { ...base, factId: newFactId(), type: 'match.created', payload: config }

    const started: ClientFact = {
      ...base,
      factId: newFactId(),
      type: 'frame.started',
      payload: {
        frameIndex: 1,
        gameKey: config.gameKey,
        targetPointsBySeat: config.targets.frameTargetPointsBySeat,
      },
    }

    // Initialization is already expressed as accepted facts: there is no user intent to validate here.
    const accepted = await this.appendAcceptedFacts(matchId, [created, started])
    if (accepted.length !== 2) return { ok: false, error: 'Failed to initialize match facts', status: 500 }
    return { ok: true }
  }

  /** Creates a match row and its initial accepted facts as one DO-coordinated operation. */
  async create(
    args: unknown,
  ): Promise<{ ok: true; matchId: string; controlSecret: string } | { ok: false; error: string; status: number }> {
    const parsed = v.safeParse(CreateBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid create body', status: 400 }

    const { matchId, controlSecret, ...request } = parsed.output
    await this.rememberMatchId(matchId)

    return await this.ctx.blockConcurrencyWhile(async () => {
      if (await matchExists(this.env, matchId)) return { ok: false, error: 'Match already exists', status: 409 }

      const createRequest = v.safeParse(CreateMatchRequestSchema, request)
      if (!createRequest.success) return { ok: false, error: 'Invalid create body', status: 400 }

      const config = buildMatchConfig(matchId, createRequest.output)
      const seats = assignmentsBySeat(createRequest.output.participants)
      const now = Date.now()
      const base = { matchId, clientId: v.parse(ClientIdSchema, 'server0000'), clientSeq: 0, at: now }
      const facts: [ClientFact, ClientFact] = [
        { ...base, factId: newFactId(), type: 'match.created', payload: config },
        {
          ...base,
          factId: newFactId(),
          type: 'frame.started',
          payload: { frameIndex: 1, gameKey: config.gameKey, targetPointsBySeat: config.targets.frameTargetPointsBySeat },
        },
      ]

      let roomState: RoomState = { matchState: emptyMatchState(), currentFrameState: null }
      for (const fact of facts) {
        const validFact = v.parse(ClientFactSchema, fact)
        roomState = this.applyRoomFact(roomState, validFact)
      }

      await this.env.DB.batch([
        this.env.DB.prepare(
          [
            'INSERT INTO matches (',
            'match_id, control_secret, game_key, config_json, latest_seq, seat_a_player_ref, seat_b_player_ref, status, created_at',
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ].join(' '),
        ).bind(matchId, controlSecret, config.gameKey, JSON.stringify(config), 2, seats.A, seats.B, 'active', now),
        this.env.DB.prepare(
          'INSERT INTO facts (match_id, seq, fact_id, type, payload_json, client_id, client_seq, at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(
          matchId,
          1,
          facts[0].factId,
          facts[0].type,
          JSON.stringify(facts[0].payload),
          facts[0].clientId,
          facts[0].clientSeq,
          facts[0].at,
          now,
        ),
        this.env.DB.prepare(
          'INSERT INTO facts (match_id, seq, fact_id, type, payload_json, client_id, client_seq, at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(
          matchId,
          2,
          facts[1].factId,
          facts[1].type,
          JSON.stringify(facts[1].payload),
          facts[1].clientId,
          facts[1].clientSeq,
          facts[1].at,
          now,
        ),
      ])
      this.ctx.storage
        .put('roomState', { latestSeq: 2, roomState } satisfies CachedRoomState)
        .catch((error: unknown) => console.error('Failed to warm MatchRoom cache after create', { matchId, error }))

      return { ok: true, matchId, controlSecret }
    })
  }

  /** Returns the current match snapshot and control projections for one room. */
  async snapshot(
    args: unknown,
  ): Promise<
    | { ok: true; snapshot: unknown; controlProjection: unknown | undefined; controlSections: unknown }
    | { ok: false; error: string; status: number }
  > {
    const parsed = v.safeParse(SnapshotBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid snapshot body', status: 400 }

    const { matchId } = parsed.output
    await this.rememberMatchId(matchId)
    const row = await getMatch(this.env, matchId)
    if (!row) return { ok: false, error: 'Unknown match', status: 400 }

    await this.pruneSnapshotIfExpired(matchId, row.status, row.lock_at)
    const { roomState, latestSeq } = await this.loadRoomState(matchId)
    if (latestSeq === 0 || !roomState.matchState.config) {
      return { ok: false, error: 'Match is not initialized', status: 409 }
    }
    const snapshot = snapshotFromMatchState(roomState.matchState, latestSeq)

    // The match snapshot is domain state; controls are a projection of the current game frame.
    const controlProjection =
      roomState.currentFrameState && roomState.matchState.config
        ? deriveGameProjection({
            gameKey: parseGameKey(roomState.matchState.config.gameKey),
            state: roomState.currentFrameState,
            projection: 'control',
          })
        : undefined
    const controlSections = deriveSparringControlSections({
      matchState: roomState.matchState,
      gameControlProjection: controlProjection,
    })

    return { ok: true, snapshot, controlProjection, controlSections }
  }

  /** Accepts control commands, persists resulting facts, and broadcasts them. */
  async facts(
    args: unknown,
  ): Promise<{ ok: true; accepted: { seq: number; factId: string }[] } | { ok: false; error: string; status: number }> {
    const parsed = v.safeParse(FactsBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid facts body', status: 400 }

    const { matchId, controlSecret, commands } = parsed.output
    await this.rememberMatchId(matchId)
    const row = await getMatch(this.env, matchId)
    if (!row) return { ok: false, error: 'Unknown match', status: 400 }
    if (row.control_secret !== controlSecret) return { ok: false, error: 'Unauthorized', status: 401 }

    if (row.lock_at && Date.now() >= row.lock_at) {
      await this.pruneSnapshotIfExpired(matchId, row.status, row.lock_at)
      return { ok: false, error: 'Match is locked', status: 423 }
    }

    const accepted = await this.acceptCommands(matchId, commands)
    return { ok: true, accepted }
  }

  /** Opens a Server-Sent Events stream for committed room facts. */
  async stream(args: unknown): Promise<Response> {
    const parsed = v.safeParse(StreamBodySchema, args)
    if (!parsed.success) return Response.json({ ok: false, error: 'Invalid stream body' }, { status: 400 })

    const { matchId, since = 0 } = parsed.output
    await this.rememberMatchId(matchId)
    const latestSeq = await getLatestSeq(this.env, matchId)

    let client: {
      controller: ReadableStreamDefaultController<Uint8Array>
      pingTimer: ReturnType<typeof setInterval>
    } | null = null

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const sendLine = (line: string) => {
          controller.enqueue(this.encoder.encode(line))
        }

        // A new SSE client first receives missed committed facts, then joins live fan-out.
        const backlog = await listFactsAfter(this.env, matchId, since)
        sendLine(`event: ready\ndata: ${JSON.stringify({ latestSeq })}\n\n`)
        for (const ev of backlog) {
          sendLine(`event: ev\ndata: ${JSON.stringify(ev)}\n\n`)
        }

        client = {
          controller,
          pingTimer: setInterval(() => {
            try {
              controller.enqueue(this.encoder.encode(`: ping ${Date.now()}\n\n`))
            } catch {
              // if enqueue fails, cancel will run later
            }
          }, 25000),
        }
        this.clients.add(client)
      },
      cancel: () => {
        if (client) {
          clearInterval(client.pingTimer)
          this.clients.delete(client)
          client = null
        }
      },
    })

    return new Response(stream, { headers: sseHeaders() })
  }

  /** Remembers the room's match id in Durable Object storage for diagnostics and cache recovery. */
  private async rememberMatchId(matchId: string): Promise<void> {
    await this.ctx.storage.put('matchId', matchId)
  }

  /** Applies one accepted room fact to both match state and current game-frame state. */
  private applyRoomFact(roomState: RoomState, fact: ClientFact): RoomState {
    const matchState = applyMatchFact(structuredClone(roomState.matchState), fact)

    if (fact.type === 'frame.started') {
      // Starting a frame opens a fresh game runtime state for the configured game and targets.
      return {
        matchState,
        currentFrameState: createInitialGameState(parseGameKey(fact.payload.gameKey), {
          targetPointsBySeat: fact.payload.targetPointsBySeat,
        }),
      }
    }

    if (fact.type === 'game.command') {
      if (roomState.currentFrameState === null) throw new Error('No current frame')
      // Game facts are replayed through gameplay so the hot cache can rebuild from only persisted facts.
      const result = applyGameCommand({
        gameKey: parseGameKey(fact.payload.gameKey),
        state: roomState.currentFrameState,
        commandType: fact.payload.commandType,
        command: fact.payload.command,
      })
      return {
        matchState,
        currentFrameState: result.state,
      }
    }

    if (fact.type === 'frame.completed') {
      return { matchState, currentFrameState: null }
    }

    return { matchState, currentFrameState: roomState.currentFrameState }
  }

  /** Loads the hot room cache, rebuilding it from the persisted fact log when necessary. */
  private async loadRoomState(matchId: string): Promise<{ roomState: RoomState; latestSeq: number }> {
    const latestSeq = await getLatestSeq(this.env, matchId)
    const cached = await this.ctx.storage.get<CachedRoomState>('roomState')
    if (cached?.latestSeq === latestSeq) return { roomState: cached.roomState, latestSeq }

    let roomState: RoomState = { matchState: emptyMatchState(), currentFrameState: null }
    // D1 facts are the source of truth; Durable Object storage is only a warm cache.
    const facts = await listFactsAfter(this.env, matchId, 0)
    for (const fact of facts) {
      roomState = this.applyRoomFact(roomState, fact)
    }
    await this.ctx.storage.put('roomState', { latestSeq, roomState } satisfies CachedRoomState)
    return { roomState, latestSeq }
  }

  /** Builds the shared metadata used by server-originated room facts. */
  private factBase(matchId: string): Omit<ClientFact, 'factId' | 'type' | 'payload'> {
    return {
      matchId: v.parse(MatchIdSchema, matchId),
      clientId: v.parse(ClientIdSchema, 'server0000'),
      clientSeq: 0,
      at: Date.now(),
    }
  }

  /** Returns the match winner once the configured frame target has been reached. */
  private matchWinner(config: MatchConfig, matchState: MatchState): 'A' | 'B' | null {
    if (matchState.framesWonBySeat.A >= config.targets.matchTargetFrames) return 'A'
    if (matchState.framesWonBySeat.B >= config.targets.matchTargetFrames) return 'B'
    return null
  }

  /** Converts one accepted control command into the room facts it implies. */
  private factsForCommand(roomState: RoomState, matchId: string, command: ControlCommand): ClientFact[] {
    const config = roomState.matchState.config
    if (!config) throw new Error('Missing match config')
    const base = this.factBase(matchId)

    if (command.source === 'match' && command.commandType === 'frame.start') {
      return [
        {
          ...base,
          factId: newFactId(),
          type: 'frame.started',
          payload: {
            frameIndex: roomState.matchState.currentFrameIndex + 1,
            gameKey: config.gameKey,
            targetPointsBySeat: config.targets.frameTargetPointsBySeat,
          },
        },
      ]
    }

    if (command.source === 'match' && command.commandType === 'match.end') {
      const winnerSeat = this.matchWinner(config, roomState.matchState)
      if (!winnerSeat) throw new Error('Cannot end match before target')
      return [
        {
          ...base,
          factId: newFactId(),
          type: 'match.ended',
          payload: { winnerSeat },
        },
      ]
    }

    if (command.source === 'match' && command.commandType === 'frame.concede') {
      if (roomState.currentFrameState === null) throw new Error('No current frame')
      const currentFrame = roomState.matchState.frames[roomState.matchState.frames.length - 1]
      if (!currentFrame || currentFrame.winnerSeat) throw new Error('No active frame')

      const concede = v.parse(ConcedeFrameCommandSchema, command.command)
      const projection = v.parse(
        GameScoreProjectionSchema,
        deriveGameProjection({
          gameKey: parseGameKey(config.gameKey),
          state: roomState.currentFrameState,
          projection: 'summary',
        }),
      )

      return [
        {
          ...base,
          factId: newFactId(),
          type: 'frame.completed',
          payload: {
            frameIndex: currentFrame.frameIndex,
            gameKey: config.gameKey,
            outcome: {
              winnerSeat: opponentOf(concede.seat),
              score: projection.score,
              winReason: 'conceded',
            },
          },
        },
      ]
    }

    if (command.source !== 'game') throw new Error(`Unsupported match command ${command.commandType}`)
    if (roomState.currentFrameState === null) throw new Error('No current frame')
    const currentFrame = roomState.matchState.frames[roomState.matchState.frames.length - 1]
    if (!currentFrame || currentFrame.winnerSeat) throw new Error('No active frame')
    // The game runtime decides whether this command merely changes game state or also completes the frame.
    const result = applyGameCommand({
      gameKey: parseGameKey(config.gameKey),
      state: roomState.currentFrameState,
      commandType: command.commandType,
      command: command.command,
    })

    const gameCommand: ClientFact = {
      ...base,
      factId: newFactId(),
      type: 'game.command',
      payload: {
        frameIndex: currentFrame.frameIndex,
        gameKey: config.gameKey,
        commandType: command.commandType,
        command: command.command,
        protocolEntries: result.protocolEntries,
      },
    }

    if (!result.outcome) return [gameCommand]
    return [
      gameCommand,
      {
        ...base,
        factId: newFactId(),
        type: 'frame.completed',
        payload: {
          frameIndex: currentFrame.frameIndex,
          gameKey: config.gameKey,
          outcome: result.outcome,
        },
      },
    ]
  }

  /** Appends already-accepted facts to D1, updates caches, and broadcasts committed facts to SSE clients. */
  private async appendAcceptedFacts(matchId: string, facts: ClientFact[]): Promise<{ seq: number; factId: string }[]> {
    // blockConcurrencyWhile makes this DO operation single-file, preserving event ordering under concurrent requests.
    return await this.ctx.blockConcurrencyWhile(async () => {
      let seq = await getLatestSeq(this.env, matchId)
      let cached = await this.ctx.storage.get<CachedRoomState>('roomState')
      let roomState = cached?.latestSeq === seq ? cached.roomState : undefined
      if (!roomState) roomState = (await this.loadRoomState(matchId)).roomState
      const receivedAt = Date.now()
      const accepted: { seq: number; factId: string }[] = []

      for (const fact of facts) {
        const parsed = v.safeParse(ClientFactSchema, fact)
        if (!parsed.success) continue

        const factId = parsed.output.factId
        if (await factExists(this.env, matchId, factId)) {
          continue
        }

        try {
          roomState = this.applyRoomFact(roomState, parsed.output)
        } catch {
          continue
        }

        const nextSeq = seq + 1
        await insertStoredFact(this.env, matchId, nextSeq, parsed.output, receivedAt)
        await setMatchLatestSeq(this.env, matchId, nextSeq)

        seq = nextSeq

        accepted.push({ seq, factId })
        await this.broadcast({ ...parsed.output, seq, receivedAt })

        if (parsed.output.type === 'match.ended') {
          const endedAt = receivedAt
          const lockAt = endedAt + 10 * 60 * 1000
          await markMatchEnded(this.env, matchId, endedAt, lockAt)
        }

        if (this.shouldPersistSnapshot(parsed.output.type, seq)) {
          await putLatestMatchSnapshot(this.env, {
            matchId,
            latestSeq: seq,
            state: roomState.matchState,
          })
        }
      }

      await this.ctx.storage.put('roomState', { latestSeq: seq, roomState } satisfies CachedRoomState)
      return accepted
    })
  }

  /** Accepts control commands by translating them into facts before persistence or broadcast. */
  private async acceptCommands(matchId: string, commands: ControlCommand[]): Promise<{ seq: number; factId: string }[]> {
    // Commands are intents and never go to SSE directly; only persisted, sequenced facts are broadcast.
    return await this.ctx.blockConcurrencyWhile(async () => {
      let seq = await getLatestSeq(this.env, matchId)
      let cached = await this.ctx.storage.get<CachedRoomState>('roomState')
      let roomState = cached?.latestSeq === seq ? cached.roomState : undefined
      if (!roomState) roomState = (await this.loadRoomState(matchId)).roomState
      const receivedAt = Date.now()
      const accepted: { seq: number; factId: string }[] = []

      for (const command of commands) {
        let facts: ClientFact[]
        try {
          facts = this.factsForCommand(roomState, matchId, command)
        } catch {
          continue
        }

        for (const fact of facts) {
          let nextRoomState: RoomState
          try {
            nextRoomState = this.applyRoomFact(roomState, fact)
          } catch {
            continue
          }

          const nextSeq = seq + 1
          await insertStoredFact(this.env, matchId, nextSeq, fact, receivedAt)
          await setMatchLatestSeq(this.env, matchId, nextSeq)

          seq = nextSeq
          roomState = nextRoomState

          accepted.push({ seq, factId: fact.factId })
          await this.broadcast({ ...fact, seq, receivedAt })

          if (fact.type === 'match.ended') {
            const endedAt = receivedAt
            const lockAt = endedAt + 10 * 60 * 1000
            const archiveSourceFacts = await listFactsAfter(this.env, matchId, 0)
            await insertProtocolArchive(this.env, matchId, seq, prepareProtocolRowsForArchive(archiveSourceFacts), endedAt)
            await markMatchEnded(this.env, matchId, endedAt, lockAt)
          }

          if (this.shouldPersistSnapshot(fact.type, seq)) {
            await putLatestMatchSnapshot(this.env, {
              matchId,
              latestSeq: seq,
              state: roomState.matchState,
            })
          }
        }
      }

      await this.ctx.storage.put('roomState', { latestSeq: seq, roomState } satisfies CachedRoomState)
      return accepted
    })
  }

  /** Decides whether the current fact boundary should refresh the D1 snapshot row. */
  private shouldPersistSnapshot(factType: ClientFact['type'], seq: number): boolean {
    if (seq % 10 === 0) return true
    if (factType === 'frame.completed') return true
    if (factType === 'match.ended') return true
    return false
  }

  /** Deletes stale snapshots after the finished-match lock period has elapsed. */
  private async pruneSnapshotIfExpired(matchId: string, status: string, lockAt: number | null): Promise<void> {
    if (status !== 'finished') return
    if (!lockAt) return
    if (Date.now() < lockAt) return
    await deleteMatchSnapshot(this.env, matchId)
  }

  /** Sends one committed fact to every currently connected SSE client. */
  private async broadcast(storedFact: StoredFact): Promise<void> {
    const line = `event: ev\ndata: ${JSON.stringify(storedFact)}\n\n`
    const bytes = this.encoder.encode(line)
    for (const client of this.clients) {
      try {
        client.controller.enqueue(bytes)
      } catch {
        clearInterval(client.pingTimer)
        this.clients.delete(client)
      }
    }
  }
}
