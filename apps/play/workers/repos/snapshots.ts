import type { MatchState } from '@ks/competition'

import type { Env } from '../env'

type MatchSnapshotRow = {
  match_id: string
  latest_seq: number
  state_json: string
  created_at: number
}

export async function getMatchSnapshot(env: Env, matchId: string): Promise<MatchSnapshotRow | null> {
  const row = await env.DB.prepare('SELECT * FROM match_snapshots WHERE match_id = ?').bind(matchId).first<MatchSnapshotRow>()
  return row ?? null
}

export async function putLatestMatchSnapshot(
  env: Env,
  args: { matchId: string; latestSeq: number; state: MatchState },
): Promise<void> {
  await env.DB.prepare(
    [
      'INSERT INTO match_snapshots (match_id, latest_seq, state_json, created_at)',
      'VALUES (?, ?, ?, ?)',
      'ON CONFLICT(match_id) DO UPDATE SET latest_seq = excluded.latest_seq, state_json = excluded.state_json, created_at = excluded.created_at',
    ].join(' '),
  )
    .bind(args.matchId, args.latestSeq, JSON.stringify(args.state), Date.now())
    .run()
}

export async function deleteMatchSnapshot(env: Env, matchId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM match_snapshots WHERE match_id = ?').bind(matchId).run()
}
