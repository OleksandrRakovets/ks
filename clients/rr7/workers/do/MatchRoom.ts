import { MatchStateSchema, applyMatchEvent, emptyMatchState, snapshotFromMatchState, type MatchState } from '@ks/competition'
import {
  ClientEventSchema,
  ClientIdSchema,
  MatchConfigSchema,
  MatchIdSchema,
  newEventId,
  type ClientEvent,
  type StoredEvent,
} from '@ks/core'
import { Hono } from 'hono'
import invariant from 'tiny-invariant'
import { z } from 'zod'

import type { Env } from '../env'
import { badRequest, json, unauthorized } from '../http-utils'
import { eventExists, getLatestSeq, insertStoredEvent, listEventsAfter } from '../repos/events'
import { getMatch, markMatchEnded } from '../repos/matches'
import { deleteMatchSnapshot, getMatchSnapshot, putLatestMatchSnapshot } from '../repos/snapshots'

const InitBodySchema = z.object({
  controlSecret: z.string().min(16),
  config: MatchConfigSchema,
})

const EventsBodySchema = z.object({
  controlSecret: z.string().min(16),
  events: z.array(ClientEventSchema).min(1),
})

function sseHeaders(): HeadersInit {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  }
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
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
        payload: { frameIndex: 1 },
      }

      await this.appendAndBroadcast(matchId, [created, started])
      return json({ ok: true })
    })

    this.app.get('/snapshot', async (c) => {
      const matchId = await this.matchIdFromRequest(c.req.raw)
      const row = await getMatch(this.env, matchId)
      if (!row) return badRequest('Unknown match')

      await this.pruneSnapshotIfExpired(matchId, row.status, row.lock_at)
      const { derived, latestSeq } = await this.loadDerived(matchId)
      return json({ ok: true, snapshot: snapshotFromMatchState(derived, latestSeq) })
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

      const accepted = await this.appendAndBroadcast(matchId, parsed.data.events)
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

  fetch(request: Request): Response | Promise<Response> {
    return this.app.fetch(request)
  }

  private async matchIdFromRequest(req: Request): Promise<string> {
    const matchId = req.headers.get('x-ks-match-id')
    invariant(matchId, 'Missing x-ks-match-id')
    await this.state.storage.put('matchId', matchId)
    return matchId
  }

  private async loadDerived(matchId: string): Promise<{ derived: MatchState; latestSeq: number }> {
    const latestSeq = await getLatestSeq(this.env, matchId)
    const cached = await this.state.storage.get<MatchState>('derivedState')
    if (cached) return { derived: cached, latestSeq }

    const persistedSnapshot = await getMatchSnapshot(this.env, matchId)
    let derived = emptyMatchState()
    let replayAfter = 0

    if (persistedSnapshot && persistedSnapshot.latest_seq <= latestSeq) {
      const decoded = tryParseJson(persistedSnapshot.state_json)
      if (decoded !== null) {
        const parsed = MatchStateSchema.safeParse(decoded)
        if (parsed.success) {
          derived = parsed.data
          replayAfter = persistedSnapshot.latest_seq
        }
      }
    }

    const events = await listEventsAfter(this.env, matchId, replayAfter)
    for (const ev of events) {
      derived = applyMatchEvent(derived, ev)
    }
    await this.state.storage.put('derivedState', derived)
    return { derived, latestSeq }
  }

  private async appendAndBroadcast(matchId: string, events: ClientEvent[]): Promise<{ seq: number; eventId: string }[]> {
    return await this.state.blockConcurrencyWhile(async () => {
      let seq = (await this.state.storage.get<number>('seq')) ?? (await getLatestSeq(this.env, matchId))
      let derived = await this.state.storage.get<MatchState>('derivedState')
      if (!derived) {
        derived = (await this.loadDerived(matchId)).derived
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

        let nextDerived: MatchState
        try {
          nextDerived = applyMatchEvent(structuredClone(derived), parsed.data)
        } catch {
          continue
        }

        const nextSeq = seq + 1
        await insertStoredEvent(this.env, matchId, nextSeq, parsed.data, receivedAt)

        seq = nextSeq
        derived = nextDerived

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
            state: derived,
          })
        }
      }

      await this.state.storage.put('seq', seq)
      await this.state.storage.put('derivedState', derived)
      return accepted
    })
  }

  private shouldPersistSnapshot(eventType: ClientEvent['type'], seq: number): boolean {
    if (seq % 10 === 0) return true
    if (eventType === 'frame.awarded') return true
    if (eventType === 'match.ended') return true
    return false
  }

  private async pruneSnapshotIfExpired(matchId: string, status: string, lockAt: number | null): Promise<void> {
    if (status !== 'finished') return
    if (!lockAt) return
    if (Date.now() < lockAt) return
    await deleteMatchSnapshot(this.env, matchId)
  }

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
