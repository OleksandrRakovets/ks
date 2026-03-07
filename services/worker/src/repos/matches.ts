import type { MatchConfig } from '@ks/domain'

import type { Env } from '../env'

export type MatchRow = {
  match_id: string
  control_secret: string
  game_id: string
  config_json: string
  status: string
  created_at: number
  ended_at: number | null
  lock_at: number | null
}

export async function insertMatch(
  env: Env,
  args: {
    matchId: string
    controlSecret: string
    config: MatchConfig
    now: number
  },
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO matches (match_id, control_secret, game_id, config_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(args.matchId, args.controlSecret, args.config.gameId, JSON.stringify(args.config), 'active', args.now)
    .run()
}

export async function getMatch(env: Env, matchId: string): Promise<MatchRow | null> {
  const row = await env.DB.prepare('SELECT * FROM matches WHERE match_id = ?').bind(matchId).first<MatchRow>()
  return row ?? null
}

export async function markMatchEnded(env: Env, matchId: string, endedAt: number, lockAt: number): Promise<void> {
  await env.DB.prepare('UPDATE matches SET status = ?, ended_at = ?, lock_at = ? WHERE match_id = ?')
    .bind('finished', endedAt, lockAt, matchId)
    .run()
}
