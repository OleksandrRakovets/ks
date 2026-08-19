import type { D1Database } from '@cloudflare/workers-types'

import { PROTOCOL_ARCHIVE_VERSION, type ProtocolArchiveRow } from './reader'

type ProtocolArchiveRecord = {
  protocolVersion: number
  rowsJson: string
}

type ProtocolArchiveRowRecord = {
  protocol_version: number
  rows_json: string
}

type ProtocolArchiveWriteEnv = {
  DB: Pick<D1Database, 'prepare'>
}

type BoundProtocolArchiveRead = {
  first<T>(): Promise<T | null>
}

type ProtocolArchiveReadEnv = {
  DB: {
    prepare(query: string): {
      bind(...values: unknown[]): BoundProtocolArchiveRead
    }
  }
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

export async function getProtocolArchive(env: ProtocolArchiveReadEnv, matchId: string): Promise<ProtocolArchiveRecord | null> {
  const row = await env.DB.prepare('SELECT protocol_version, rows_json FROM match_protocol_archives WHERE match_id = ?')
    .bind(matchId)
    .first<ProtocolArchiveRowRecord>()

  return row ? { protocolVersion: row.protocol_version, rowsJson: row.rows_json } : null
}
