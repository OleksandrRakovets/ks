export type MatchRow = {
  match_id: string
  control_secret: string
  game_key: string
  config_json: string
  status: string
  created_at: number
  ended_at: number | null
  lock_at: number | null
}

import type { Env } from '../env'

export async function getMatch(env: Env, matchId: string): Promise<MatchRow | null> {
  const row = await env.DB.prepare('SELECT * FROM matches WHERE match_id = ?').bind(matchId).first<MatchRow>()
  return row ?? null
}

export async function markMatchEnded(env: Env, matchId: string, endedAt: number, lockAt: number): Promise<void> {
  await env.DB.prepare('UPDATE matches SET status = ?, ended_at = ?, lock_at = ? WHERE match_id = ?')
    .bind('finished', endedAt, lockAt, matchId)
    .run()
}
