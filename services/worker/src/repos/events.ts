import type { ClientEvent, StoredEvent } from '@ks/core'

import type { Env } from '../env'

export async function eventExists(env: Env, matchId: string, eventId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS one FROM events WHERE match_id = ? AND event_id = ?')
    .bind(matchId, eventId)
    .first<{ one: 1 }>()
  return Boolean(row)
}

export async function getLatestSeq(env: Env, matchId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT MAX(seq) as max_seq FROM events WHERE match_id = ?')
    .bind(matchId)
    .first<{ max_seq: number | null }>()
  return row?.max_seq ?? 0
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

  return (res.results ?? []).map((r) => ({
    seq: r.seq,
    eventId: r.event_id as any,
    matchId: matchId as any,
    clientId: r.client_id as any,
    clientSeq: r.client_seq,
    at: r.at,
    receivedAt: r.received_at,
    type: r.type as any,
    payload: JSON.parse(r.payload_json),
  })) as StoredEvent[]
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
    .bind(
      matchId,
      seq,
      ev.eventId as unknown as string,
      ev.type,
      JSON.stringify(ev.payload ?? {}),
      ev.clientId as unknown as string,
      ev.clientSeq,
      ev.at,
      receivedAt,
    )
    .run()
}
