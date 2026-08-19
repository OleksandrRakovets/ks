import { normalizeMatchId } from '@ks/competition'
import { StoredFactSchema, type StoredFact } from '@ks/core'
import * as v from 'valibot'

import type { ApplicationDatabase } from './types'

export type MatchListRow = {
  match_id: string
  game_key: string
  status: string
  created_at: number
  seat_a_player_ref: string
  seat_b_player_ref: string
}

export async function listMatchRows(db: ApplicationDatabase): Promise<MatchListRow[]> {
  const result = await db
    .prepare(
      [
        'SELECT match_id, game_key, status, created_at, seat_a_player_ref, seat_b_player_ref',
        'FROM matches',
        "ORDER BY CASE WHEN status = 'finished' THEN 1 ELSE 0 END ASC, created_at DESC",
      ].join(' '),
    )
    .bind()
    .all<MatchListRow>()
  return result.results ?? []
}

export async function getMatchParticipantRefs(
  db: ApplicationDatabase,
  matchId: string,
): Promise<{ A: string; B: string } | null> {
  const row = await db
    .prepare('SELECT seat_a_player_ref, seat_b_player_ref FROM matches WHERE match_id = ?')
    .bind(normalizeMatchId(matchId))
    .first<{ seat_a_player_ref: string; seat_b_player_ref: string }>()
  return row ? { A: row.seat_a_player_ref, B: row.seat_b_player_ref } : null
}

export async function getMatchControlSecret(db: ApplicationDatabase, matchId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT control_secret FROM matches WHERE match_id = ?')
    .bind(normalizeMatchId(matchId))
    .first<{ control_secret: string }>()
  return row?.control_secret ?? null
}

export async function listStoredFacts(db: ApplicationDatabase, matchId: string): Promise<StoredFact[]> {
  const normalizedMatchId = normalizeMatchId(matchId)
  const result = await db
    .prepare(
      'SELECT seq, fact_id, type, payload_json, client_id, client_seq, at, received_at FROM facts WHERE match_id = ? ORDER BY seq ASC',
    )
    .bind(normalizedMatchId)
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

  return (result.results ?? []).flatMap((row) => {
    const payload = v.safeParse(v.pipe(v.string(), v.parseJson()), row.payload_json)
    if (!payload.success) return []
    const fact = v.safeParse(StoredFactSchema, {
      seq: row.seq,
      factId: row.fact_id,
      matchId: normalizedMatchId,
      clientId: row.client_id,
      clientSeq: row.client_seq,
      at: row.at,
      receivedAt: row.received_at,
      type: row.type,
      payload: payload.output,
    })
    return fact.success ? [fact.output] : []
  })
}
