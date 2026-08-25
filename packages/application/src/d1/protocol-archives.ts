import { type MatchId, MatchIdSchema, MatchStateSchema, PositiveIntegerSchema } from '@ks/core'
import { eq } from 'drizzle-orm'
import * as v from 'valibot'

import {
  PROTOCOL_ARCHIVE_VERSION,
  ProtocolArchiveCorruptionError,
  type ProtocolArchiveRecord,
  ProtocolArchiveRowsSchema,
  UnsupportedProtocolArchiveVersionError,
} from '../protocol'
import { matchProtocolArchives } from './schema'
import type { ApplicationDatabase } from './types'

const ProtocolArchiveStorageRowSchema = v.pipe(
  v.object({
    matchId: MatchIdSchema,
    sourceLatestSeq: PositiveIntegerSchema,
    protocolVersion: v.literal(PROTOCOL_ARCHIVE_VERSION),
    rowsJson: v.pipe(v.string(), v.parseJson(), ProtocolArchiveRowsSchema),
    stateJson: v.pipe(v.string(), v.parseJson(), MatchStateSchema),
  }),
  v.transform(({ rowsJson, stateJson, ...row }) => ({ ...row, rows: rowsJson, state: stateJson })),
  v.check((value) => value.state.status === 'finished', 'Archive state is not finished'),
  v.check((value) => value.state.matchId === value.matchId, 'Archive match ID does not match state'),
)

export async function getProtocolArchive(db: ApplicationDatabase, matchId: MatchId): Promise<ProtocolArchiveRecord | null> {
  const row = await db
    .select({
      matchId: matchProtocolArchives.matchId,
      sourceLatestSeq: matchProtocolArchives.sourceLatestSeq,
      protocolVersion: matchProtocolArchives.protocolVersion,
      rowsJson: matchProtocolArchives.rowsJson,
      stateJson: matchProtocolArchives.stateJson,
    })
    .from(matchProtocolArchives)
    .where(eq(matchProtocolArchives.matchId, matchId))
    .get()
  if (!row) return null
  try {
    const parsed = v.parse(ProtocolArchiveStorageRowSchema, row)
    const { matchId: _matchId, ...archive } = parsed
    return archive
  } catch {
    if (row.protocolVersion !== PROTOCOL_ARCHIVE_VERSION) {
      throw new UnsupportedProtocolArchiveVersionError(matchId, row.protocolVersion)
    }
    throw new ProtocolArchiveCorruptionError(matchId)
  }
}
