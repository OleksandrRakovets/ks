import { type ClientFact, StoredFactSchema, type StoredFact } from '@ks/core'
import * as v from 'valibot'

import type { Env } from '../env'
import { getMatchLatestSeq } from './matches'

export async function factExists(env: Env, matchId: string, factId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS one FROM facts WHERE match_id = ? AND fact_id = ?')
    .bind(matchId, factId)
    .first<{ one: 1 }>()
  return Boolean(row)
}

export async function getLatestSeq(env: Env, matchId: string): Promise<number> {
  return getMatchLatestSeq(env, matchId)
}

export async function listFactsAfter(env: Env, matchId: string, sinceSeq: number): Promise<StoredFact[]> {
  const res = await env.DB.prepare(
    'SELECT seq, fact_id, type, payload_json, client_id, client_seq, at, received_at FROM facts WHERE match_id = ? AND seq > ? ORDER BY seq ASC',
  )
    .bind(matchId, sinceSeq)
    .all<{
      seq: number
      fact_id: string
      type: string
      payload_json: string
      client_id: string
      client_seq: number
      at: number
      received_at: number
    }>()

  return (res.results ?? [])
    .map((r) => {
      const payload = v.safeParse(v.pipe(v.string(), v.parseJson()), r.payload_json)
      if (!payload.success) return null

      const parsed = v.safeParse(StoredFactSchema, {
        seq: r.seq,
        factId: r.fact_id,
        matchId,
        clientId: r.client_id,
        clientSeq: r.client_seq,
        at: r.at,
        receivedAt: r.received_at,
        type: r.type,
        payload: payload.output,
      })

      return parsed.success ? parsed.output : null
    })
    .flatMap((parsed) => (parsed ? [parsed] : []))
}

export async function insertStoredFact(
  env: Env,
  matchId: string,
  seq: number,
  fact: ClientFact,
  receivedAt: number,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO facts (match_id, seq, fact_id, type, payload_json, client_id, client_seq, at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      matchId,
      seq,
      fact.factId,
      fact.type,
      JSON.stringify(fact.payload ?? {}),
      fact.clientId,
      fact.clientSeq,
      fact.at,
      receivedAt,
    )
    .run()
}
