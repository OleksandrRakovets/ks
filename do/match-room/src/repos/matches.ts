import type { Env } from '../env'

export type MatchRow = {
  match_id: string
  control_secret: string
  game_key: string
  config_json: string
  latest_seq: number
  seat_a_player_ref: string
  seat_b_player_ref: string
  status: string
  created_at: number
  ended_at: number | null
  lock_at: number | null
}

export async function getMatch(env: Env, matchId: string): Promise<MatchRow | null> {
  const row = await env.DB.prepare('SELECT * FROM matches WHERE match_id = ?').bind(matchId).first<MatchRow>()
  return row ?? null
}

export async function matchExists(env: Env, matchId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS one FROM matches WHERE match_id = ?').bind(matchId).first<{ one: 1 }>()
  return Boolean(row)
}

export async function markMatchEnded(env: Env, matchId: string, endedAt: number, lockAt: number): Promise<void> {
  await env.DB.prepare('UPDATE matches SET status = ?, ended_at = ?, lock_at = ? WHERE match_id = ?')
    .bind('finished', endedAt, lockAt, matchId)
    .run()
}

export async function getMatchLatestSeq(env: Env, matchId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT latest_seq FROM matches WHERE match_id = ?')
    .bind(matchId)
    .first<{ latest_seq: number }>()
  return row?.latest_seq ?? 0
}

export async function setMatchLatestSeq(env: Env, matchId: string, latestSeq: number): Promise<void> {
  await env.DB.prepare('UPDATE matches SET latest_seq = ? WHERE match_id = ?').bind(latestSeq, matchId).run()
}
