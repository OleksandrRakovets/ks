import type { D1Database } from '@cloudflare/workers-types'
import { PROTOCOL_ARCHIVE_VERSION, type ProtocolArchiveRow } from '@ks/application/match-room'

type ProtocolArchiveWriteEnv = {
  DB: Pick<D1Database, 'prepare'>
}

export async function insertProtocolArchive(
  env: ProtocolArchiveWriteEnv,
  matchId: string,
  sourceLatestSeq: number,
  rows: ProtocolArchiveRow[],
  createdAt: number,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO match_protocol_archives (match_id, source_latest_seq, protocol_version, rows_json, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(matchId, sourceLatestSeq, PROTOCOL_ARCHIVE_VERSION, JSON.stringify(rows), createdAt)
    .run()
}
