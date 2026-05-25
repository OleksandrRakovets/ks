import { applyMatchEvent, emptyMatchState, snapshotFromMatchState, type MatchState } from '@ks/competition'
import {
  ClientEventSchema,
  ClientIdSchema,
  ControlCommandSchema,
  MatchConfigSchema,
  MatchIdSchema,
  newEventId,
  type ClientEvent,
  type ControlCommand,
  type MatchConfig,
  type StoredEvent,
} from '@ks/core'
import { applyGameCommand, createInitialGameState, deriveGameProjection, parseGameKey } from '@ks/gameplay'
import { Hono } from 'hono'
import invariant from 'tiny-invariant'
import { z } from 'zod'

import type { Env } from '../env'
import { badRequest, json, unauthorized } from '../http-utils'
import { eventExists, getLatestSeq, insertStoredEvent, listEventsAfter } from '../repos/events'
import { getMatch, markMatchEnded, setMatchLatestSeq } from '../repos/matches'
import { deleteMatchSnapshot, putLatestMatchSnapshot } from '../repos/snapshots'

const InitBodySchema = z.object({
  controlSecret: z.string().min(16),
  config: MatchConfigSchema,
})

const EventsBodySchema = z.object({
  controlSecret: z.string().min(16),
  commands: z.array(ControlCommandSchema).min(1),
})

type RoomState = {
  matchState: MatchState
  currentFrameState: unknown | null
}

/** Returns headers required for a long-lived Server-Sent Events response. */
function sseHeaders(): HeadersInit {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  }
}

export class MatchRoom implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private app: Hono
  private encoder = new TextEncoder()
  private clients = new Set<{
    controller: ReadableStreamDefaultController<Uint8Array>
    pingTimer: ReturnType<typeof setInterval>
  }>()

  /** Creates the in-memory router and registers all Durable Object endpoints. */
  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.app = new Hono()

    this.app.post('/internal/init', async (c) => {
      const body = await c.req.json().catch(() => null)
      const parsed = InitBodySchema.safeParse(body)
      if (!parsed.success) return badRequest('Invalid init body')

      const matchId = await this.matchIdFromRequest(c.req.raw)
      const row = await getMatch(this.env, matchId)
      if (!row) return badRequest('Unknown match')
      if (row.control_secret !== parsed.data.controlSecret) return unauthorized()

      const latest = await getLatestSeq(this.env, matchId)
      if (latest > 0) return json({ ok: true, alreadyInitialized: true })

      const now = Date.now()
      const parsedMatchId = MatchIdSchema.parse(matchId)
      const serverClientId = ClientIdSchema.parse('server0000')
      const base = {
        matchId: parsedMatchId,
        clientId: serverClientId,
        clientSeq: 0,
        at: now,
      }

      const created: ClientEvent = {
        ...base,
        eventId: newEventId(),
        type: 'match.created',
        payload: parsed.data.config,
      }

      const started: ClientEvent = {
        ...base,
        eventId: newEventId(),
        type: 'frame.started',
        payload: {
          frameIndex: 1,
          gameKey: parsed.data.config.gameKey,
          targetPointsBySeat: parsed.data.config.targets.frameTargetPointsBySeat,
        },
      }

      // Initialization is already expressed as accepted facts: there is no user intent to validate here.
      await this.appendAcceptedFacts(matchId, [created, started])
      return json({ ok: true })
    })

    this.app.get('/snapshot', async (c) => {
      const matchId = await this.matchIdFromRequest(c.req.raw)
      const row = await getMatch(this.env, matchId)
      if (!row) return badRequest('Unknown match')

      await this.pruneSnapshotIfExpired(matchId, row.status, row.lock_at)
      const { roomState, latestSeq } = await this.loadRoomState(matchId)
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

      return json({ ok: true, snapshot, controlProjection })
    })

    this.app.post('/events', async (c) => {
      const body = await c.req.json().catch(() => null)
      const parsed = EventsBodySchema.safeParse(body)
      if (!parsed.success) return badRequest('Invalid events body')

      const matchId = await this.matchIdFromRequest(c.req.raw)
      const row = await getMatch(this.env, matchId)
      if (!row) return badRequest('Unknown match')
      if (row.control_secret !== parsed.data.controlSecret) return unauthorized()

      if (row.lock_at && Date.now() >= row.lock_at) {
        await this.pruneSnapshotIfExpired(matchId, row.status, row.lock_at)
        return json({ ok: false, error: 'Match is locked' }, { status: 423 })
      }

      const accepted = await this.acceptCommands(matchId, parsed.data.commands)
      return json({ ok: true, accepted })
    })

    this.app.get('/stream', async (c) => {
      const matchId = await this.matchIdFromRequest(c.req.raw)
      const since = Number(c.req.query('since') ?? '0')
      const startSeq = Number.isFinite(since) && since >= 0 ? since : 0

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
          const backlog = await listEventsAfter(this.env, matchId, startSeq)
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
    })
  }

  /** Delegates the Worker fetch entrypoint to the internal Hono router. */
  fetch(request: Request): Response | Promise<Response> {
    return this.app.fetch(request)
  }

  /** Reads the target match id from the Worker-to-DO request and remembers it locally. */
  private async matchIdFromRequest(req: Request): Promise<string> {
    const matchId = req.headers.get('x-ks-match-id')
    invariant(matchId, 'Missing x-ks-match-id')
    await this.state.storage.put('matchId', matchId)
    return matchId
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
    const cached = await this.state.storage.get<RoomState>('roomState')
    if (cached) return { roomState: cached, latestSeq }

    let roomState: RoomState = { matchState: emptyMatchState(), currentFrameState: null }
    // D1 events are the source of truth; Durable Object storage is only a warm cache.
    const events = await listEventsAfter(this.env, matchId, 0)
    for (const ev of events) {
      roomState = this.applyRoomFact(roomState, ev)
    }
    await this.state.storage.put('roomState', roomState)
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
    return await this.state.blockConcurrencyWhile(async () => {
      let seq = (await this.state.storage.get<number>('seq')) ?? (await getLatestSeq(this.env, matchId))
      let roomState = await this.state.storage.get<RoomState>('roomState')
      if (!roomState) {
        roomState = (await this.loadRoomState(matchId)).roomState
      }
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

      await this.state.storage.put('seq', seq)
      await this.state.storage.put('roomState', roomState)
      return accepted
    })
  }

  /** Accepts control commands by translating them into facts before persistence or broadcast. */
  private async acceptCommands(matchId: string, commands: ControlCommand[]): Promise<{ seq: number; eventId: string }[]> {
    // Commands are intents and never go to SSE directly; only persisted, sequenced facts are broadcast.
    return await this.state.blockConcurrencyWhile(async () => {
      let seq = (await this.state.storage.get<number>('seq')) ?? (await getLatestSeq(this.env, matchId))
      let roomState = await this.state.storage.get<RoomState>('roomState')
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

      await this.state.storage.put('seq', seq)
      await this.state.storage.put('roomState', roomState)
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
