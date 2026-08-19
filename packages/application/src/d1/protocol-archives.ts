import { eq } from 'drizzle-orm'

import { matchProtocolArchives } from './schema'
import type { ApplicationDatabase } from './types'

export type ProtocolArchiveRecord = {
  sourceLatestSeq: number
  protocolVersion: number
  rowsJson: string
  snapshotJson: string
}

export async function getProtocolArchive(db: ApplicationDatabase, matchId: string): Promise<ProtocolArchiveRecord | null> {
  const row = await db
    .select({
      sourceLatestSeq: matchProtocolArchives.sourceLatestSeq,
      protocolVersion: matchProtocolArchives.protocolVersion,
      rowsJson: matchProtocolArchives.rowsJson,
      snapshotJson: matchProtocolArchives.snapshotJson,
    })
    .from(matchProtocolArchives)
    .where(eq(matchProtocolArchives.matchId, matchId))
    .get()
  return row ?? null
}
