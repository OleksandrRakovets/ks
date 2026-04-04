import { StoredEventSchema, type ClientEvent, type StoredEvent } from '@ks/core'

import type { Env } from '../env'
import { getMatchLatestSeq } from './matches'

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function eventExists(env: Env, matchId: string, eventId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS one FROM events WHERE match_id = ? AND event_id = ?')
    .bind(matchId, eventId)
    .first<{ one: 1 }>()
  return Boolean(row)
}

export async function getLatestSeq(env: Env, matchId: string): Promise<number> {
  return getMatchLatestSeq(env, matchId)
}

export async function listEventsAfter(env: Env, matchId: string, sinceSeq: number): Promise<StoredEvent[]> {
  const res = await env.DB.prepare(
    'SELECT seq, event_id, type, payload_json, client_id, client_seq, at, received_at FROM events WHERE match_id = ? AND seq > ? ORDER BY seq ASC',
  )
    .bind(matchId, sinceSeq)
    .all<{
      seq: number
      event_id: string
      type: string
      payload_json: string
      client_id: string
      client_seq: number
      at: number
      received_at: number
    }>()

  return (res.results ?? [])
    .map((r) => {
      const payload = tryParseJson(r.payload_json)
      if (payload === null) return null

      const parsed = StoredEventSchema.safeParse({
        seq: r.seq,
        eventId: r.event_id,
        matchId,
        clientId: r.client_id,
        clientSeq: r.client_seq,
        at: r.at,
        receivedAt: r.received_at,
        type: r.type,
        payload,
      })

      return parsed.success ? parsed.data : null
    })
    .flatMap((parsed) => (parsed ? [parsed] : []))
}

export async function insertStoredEvent(
  env: Env,
  matchId: string,
  seq: number,
  ev: ClientEvent,
  receivedAt: number,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO events (match_id, seq, event_id, type, payload_json, client_id, client_seq, at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(matchId, seq, ev.eventId, ev.type, JSON.stringify(ev.payload ?? {}), ev.clientId, ev.clientSeq, ev.at, receivedAt)
    .run()
}
