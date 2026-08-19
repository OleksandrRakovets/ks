import type { ApplicationDatabase } from './types'

export type ProtocolArchiveRecord = {
  protocolVersion: number
  rowsJson: string
}

export async function getProtocolArchive(db: ApplicationDatabase, matchId: string): Promise<ProtocolArchiveRecord | null> {
  const row = await db
    .prepare('SELECT protocol_version, rows_json FROM match_protocol_archives WHERE match_id = ?')
    .bind(matchId)
    .first<{ protocol_version: number; rows_json: string }>()
  return row ? { protocolVersion: row.protocol_version, rowsJson: row.rows_json } : null
}
