import { eq } from 'drizzle-orm'

import { matchProtocolArchives } from './schema'
import type { ApplicationDatabase } from './types'

export type ProtocolArchiveRecord = {
  protocolVersion: number
  rowsJson: string
}

export async function getProtocolArchive(db: ApplicationDatabase, matchId: string): Promise<ProtocolArchiveRecord | null> {
  const row = await db
    .select({ protocolVersion: matchProtocolArchives.protocolVersion, rowsJson: matchProtocolArchives.rowsJson })
    .from(matchProtocolArchives)
    .where(eq(matchProtocolArchives.matchId, matchId))
    .get()
  return row ?? null
}
