import {
  applyMatchEvent,
  assignmentsBySeat,
  buildMatchConfig,
  CreateMatchRequestSchema,
  deriveSparringControlSections,
  emptyMatchState,
  snapshotFromMatchState,
  type MatchState,
} from '@ks/competition'
import {
  ClientEventSchema,
  ClientIdSchema,
  ControlCommandSchema,
  BySeatNumberSchema,
  MatchConfigSchema,
  MatchIdSchema,
  MatchSeatAssignmentSchema,
  MatchTargetsSchema,
  newEventId,
  opponentOf,
  SeatSchema,
  type ClientEvent,
  type ControlCommand,
  type MatchConfig,
  type StoredEvent,
} from '@ks/core'
import { applyGameCommand, createInitialGameState, deriveGameProjection, parseGameKey } from '@ks/gameplay'
import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'

import type { Env } from '../env'
import { eventExists, getLatestSeq, insertStoredEvent, listEventsAfter } from '../repos/events'
import { getMatch, markMatchEnded, matchExists, setMatchLatestSeq } from '../repos/matches'
import { deleteMatchSnapshot, putLatestMatchSnapshot } from '../repos/snapshots'

const InitBodySchema = z.object({
  matchId: MatchIdSchema,
  controlSecret: z.string().min(16),
  config: MatchConfigSchema,
})

const CreateBodySchema = z.object({
  matchId: MatchIdSchema,
  controlSecret: z.string().min(16),
  gameKey: z.string().min(1),
  targets: MatchTargetsSchema,
  participants: z.array(MatchSeatAssignmentSchema).length(2),
})

const EventsBodySchema = z.object({
  matchId: MatchIdSchema,
  controlSecret: z.string().min(16),
  commands: z.array(ControlCommandSchema).min(1),
})

const SnapshotBodySchema = z.object({
  matchId: MatchIdSchema,
})

const StreamBodySchema = z.object({
  matchId: MatchIdSchema,
  since: z.number().nonnegative().optional(),
})

const ConcedeFrameCommandSchema = z.object({ seat: SeatSchema })
const GameScoreProjectionSchema = z.object({ score: BySeatNumberSchema })

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
    const parsed = InitBodySchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid init body', status: 400 }

    const { matchId, controlSecret, config } = parsed.data
    await this.rememberMatchId(matchId)
    const row = await getMatch(this.env, matchId)
    if (!row) return { ok: false, error: 'Unknown match', status: 400 }
    if (row.control_secret !== controlSecret) return { ok: false, error: 'Unauthorized', status: 401 }

    const latest = await getLatestSeq(this.env, matchId)
    if (latest > 0) {
      const initialFacts = await listEventsAfter(this.env, matchId, 0)
      if (latest >= 2 && initialFacts[0]?.type === 'match.created' && initialFacts[1]?.type === 'frame.started') {
        return { ok: true, alreadyInitialized: true }
      }
      return { ok: false, error: 'Match is partially initialized', status: 409 }
    }

    const now = Date.now()
    const serverClientId = ClientIdSchema.parse('server0000')
    const base = { matchId, clientId: serverClientId, clientSeq: 0, at: now }

    const created: ClientEvent = { ...base, eventId: newEventId(), type: 'match.created', payload: config }

    const started: ClientEvent = {
      ...base,
      eventId: newEventId(),
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
    const parsed = CreateBodySchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid create body', status: 400 }

    const { matchId, controlSecret, ...request } = parsed.data
    await this.rememberMatchId(matchId)

    return await this.ctx.blockConcurrencyWhile(async () => {
      if (await matchExists(this.env, matchId)) return { ok: false, error: 'Match already exists', status: 409 }

      const createRequest = CreateMatchRequestSchema.safeParse(request)
      if (!createRequest.success) return { ok: false, error: 'Invalid create body', status: 400 }

      const config = buildMatchConfig(matchId, createRequest.data)
      const seats = assignmentsBySeat(createRequest.data.participants)
      const now = Date.now()
      const base = { matchId, clientId: ClientIdSchema.parse('server0000'), clientSeq: 0, at: now }
      const facts: [ClientEvent, ClientEvent] = [
        { ...base, eventId: newEventId(), type: 'match.created', payload: config },
        {
          ...base,
          eventId: newEventId(),
          type: 'frame.started',
          payload: { frameIndex: 1, gameKey: config.gameKey, targetPointsBySeat: config.targets.frameTargetPointsBySeat },
        },
      ]

      let roomState: RoomState = { matchState: emptyMatchState(), currentFrameState: null }
      for (const fact of facts) {
        const validFact = ClientEventSchema.parse(fact)
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
          'INSERT INTO events (match_id, seq, event_id, type, payload_json, client_id, client_seq, at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(
          matchId,
          1,
          facts[0].eventId,
          facts[0].type,
          JSON.stringify(facts[0].payload),
          facts[0].clientId,
          facts[0].clientSeq,
          facts[0].at,
          now,
        ),
        this.env.DB.prepare(
          'INSERT INTO events (match_id, seq, event_id, type, payload_json, client_id, client_seq, at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(
          matchId,
          2,
          facts[1].eventId,
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
    const parsed = SnapshotBodySchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid snapshot body', status: 400 }

    const { matchId } = parsed.data
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
  async events(
    args: unknown,
  ): Promise<{ ok: true; accepted: { seq: number; eventId: string }[] } | { ok: false; error: string; status: number }> {
    const parsed = EventsBodySchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid events body', status: 400 }

    const { matchId, controlSecret, commands } = parsed.data
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
    const parsed = StreamBodySchema.safeParse(args)
    if (!parsed.success) return Response.json({ ok: false, error: 'Invalid stream body' }, { status: 400 })

    const { matchId, since = 0 } = parsed.data
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
        const backlog = await listEventsAfter(this.env, matchId, since)
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
  private applyRoomFact(roomState: RoomState, event: ClientEvent): RoomState {
    const matchState = applyMatchEvent(structuredClone(roomState.matchState), event)

    if (event.type === 'frame.started') {
      // Starting a frame opens a fresh game runtime state for the configured game and targets.
      return {
        matchState,
        currentFrameState: createInitialGameState(parseGameKey(event.payload.gameKey), {
          targetPointsBySeat: event.payload.targetPointsBySeat,
        }),
      }
    }

    if (event.type === 'game.command') {
      if (roomState.currentFrameState === null) throw new Error('No current frame')
      // Game facts are replayed through gameplay so the hot cache can rebuild from only persisted facts.
      const result = applyGameCommand({
        gameKey: parseGameKey(event.payload.gameKey),
        state: roomState.currentFrameState,
        commandType: event.payload.commandType,
        command: event.payload.command,
      })
      return {
        matchState,
        currentFrameState: result.state,
      }
    }

    if (event.type === 'frame.completed') {
      return { matchState, currentFrameState: null }
    }

    return { matchState, currentFrameState: roomState.currentFrameState }
  }

  /** Loads the hot room cache, rebuilding it from the persisted event log when necessary. */
  private async loadRoomState(matchId: string): Promise<{ roomState: RoomState; latestSeq: number }> {
    const latestSeq = await getLatestSeq(this.env, matchId)
    const cached = await this.ctx.storage.get<CachedRoomState>('roomState')
    if (cached?.latestSeq === latestSeq) return { roomState: cached.roomState, latestSeq }

    let roomState: RoomState = { matchState: emptyMatchState(), currentFrameState: null }
    // D1 events are the source of truth; Durable Object storage is only a warm cache.
    const events = await listEventsAfter(this.env, matchId, 0)
    for (const ev of events) {
      roomState = this.applyRoomFact(roomState, ev)
    }
    await this.ctx.storage.put('roomState', { latestSeq, roomState } satisfies CachedRoomState)
    return { roomState, latestSeq }
  }

  /** Builds the shared metadata used by server-originated room facts. */
  private eventBase(matchId: string): Omit<ClientEvent, 'eventId' | 'type' | 'payload'> {
    return {
      matchId: MatchIdSchema.parse(matchId),
      clientId: ClientIdSchema.parse('server0000'),
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
  private factsForCommand(roomState: RoomState, matchId: string, command: ControlCommand): ClientEvent[] {
    const config = roomState.matchState.config
    if (!config) throw new Error('Missing match config')
    const base = this.eventBase(matchId)

    if (command.source === 'match' && command.commandType === 'frame.start') {
      return [
        {
          ...base,
          eventId: newEventId(),
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
          eventId: newEventId(),
          type: 'match.ended',
          payload: { winnerSeat },
        },
      ]
    }

    if (command.source === 'match' && command.commandType === 'frame.concede') {
      if (roomState.currentFrameState === null) throw new Error('No current frame')
      const currentFrame = roomState.matchState.frames[roomState.matchState.frames.length - 1]
      if (!currentFrame || currentFrame.winnerSeat) throw new Error('No active frame')

      const concede = ConcedeFrameCommandSchema.parse(command.command)
      const projection = GameScoreProjectionSchema.parse(
        deriveGameProjection({
          gameKey: parseGameKey(config.gameKey),
          state: roomState.currentFrameState,
          projection: 'summary',
        }),
      )

      return [
        {
          ...base,
          eventId: newEventId(),
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

    const gameCommand: ClientEvent = {
      ...base,
      eventId: newEventId(),
      type: 'game.command',
      payload: {
        frameIndex: currentFrame.frameIndex,
        gameKey: config.gameKey,
        commandType: command.commandType,
        command: command.command,
      },
    }

    if (!result.outcome) return [gameCommand]
    return [
      gameCommand,
      {
        ...base,
        eventId: newEventId(),
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
  private async appendAcceptedFacts(matchId: string, events: ClientEvent[]): Promise<{ seq: number; eventId: string }[]> {
    // blockConcurrencyWhile makes this DO operation single-file, preserving event ordering under concurrent requests.
    return await this.ctx.blockConcurrencyWhile(async () => {
      let seq = await getLatestSeq(this.env, matchId)
      let cached = await this.ctx.storage.get<CachedRoomState>('roomState')
      let roomState = cached?.latestSeq === seq ? cached.roomState : undefined
      if (!roomState) roomState = (await this.loadRoomState(matchId)).roomState
      const receivedAt = Date.now()
      const accepted: { seq: number; eventId: string }[] = []

      for (const ev of events) {
        const parsed = ClientEventSchema.safeParse(ev)
        if (!parsed.success) continue

        const eventId = parsed.data.eventId
        if (await eventExists(this.env, matchId, eventId)) {
          continue
        }

        try {
          roomState = this.applyRoomFact(roomState, parsed.data)
        } catch {
          continue
        }

        const nextSeq = seq + 1
        await insertStoredEvent(this.env, matchId, nextSeq, parsed.data, receivedAt)
        await setMatchLatestSeq(this.env, matchId, nextSeq)

        seq = nextSeq

        accepted.push({ seq, eventId })
        await this.broadcast({ ...parsed.data, seq, receivedAt })

        if (parsed.data.type === 'match.ended') {
          const endedAt = receivedAt
          const lockAt = endedAt + 10 * 60 * 1000
          await markMatchEnded(this.env, matchId, endedAt, lockAt)
        }

        if (this.shouldPersistSnapshot(parsed.data.type, seq)) {
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
  private async acceptCommands(matchId: string, commands: ControlCommand[]): Promise<{ seq: number; eventId: string }[]> {
    // Commands are intents and never go to SSE directly; only persisted, sequenced facts are broadcast.
    return await this.ctx.blockConcurrencyWhile(async () => {
      let seq = await getLatestSeq(this.env, matchId)
      let cached = await this.ctx.storage.get<CachedRoomState>('roomState')
      let roomState = cached?.latestSeq === seq ? cached.roomState : undefined
      if (!roomState) roomState = (await this.loadRoomState(matchId)).roomState
      const receivedAt = Date.now()
      const accepted: { seq: number; eventId: string }[] = []

      for (const command of commands) {
        let facts: ClientEvent[]
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
          await insertStoredEvent(this.env, matchId, nextSeq, fact, receivedAt)
          await setMatchLatestSeq(this.env, matchId, nextSeq)

          seq = nextSeq
          roomState = nextRoomState

          accepted.push({ seq, eventId: fact.eventId })
          await this.broadcast({ ...fact, seq, receivedAt })

          if (fact.type === 'match.ended') {
            const endedAt = receivedAt
            const lockAt = endedAt + 10 * 60 * 1000
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
  private shouldPersistSnapshot(eventType: ClientEvent['type'], seq: number): boolean {
    if (seq % 10 === 0) return true
    if (eventType === 'frame.completed') return true
    if (eventType === 'match.ended') return true
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
  private async broadcast(storedEvent: StoredEvent): Promise<void> {
    const line = `event: ev\ndata: ${JSON.stringify(storedEvent)}\n\n`
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
