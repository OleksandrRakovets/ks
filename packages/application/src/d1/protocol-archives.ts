import { type MatchId, MatchIdSchema, MatchSnapshotSchema, NonNegativeIntegerSchema } from '@ks/core'
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
    sourceLatestSeq: NonNegativeIntegerSchema,
    protocolVersion: v.literal(PROTOCOL_ARCHIVE_VERSION),
    rowsJson: v.pipe(v.string(), v.parseJson(), ProtocolArchiveRowsSchema),
    snapshotJson: v.pipe(v.string(), v.parseJson(), MatchSnapshotSchema),
  }),
  v.transform(({ rowsJson, snapshotJson, ...row }) => ({ ...row, rows: rowsJson, snapshot: snapshotJson })),
  v.check((value) => value.snapshot.latestSeq === value.sourceLatestSeq, 'Archive sequence does not match snapshot'),
  v.check((value) => value.snapshot.status === 'finished', 'Archive snapshot is not finished'),
  v.check((value) => value.snapshot.matchId === value.matchId, 'Archive match ID does not match snapshot'),
)

export async function getProtocolArchive(db: ApplicationDatabase, matchId: MatchId): Promise<ProtocolArchiveRecord | null> {
  const row = await db
    .select({
      matchId: matchProtocolArchives.matchId,
      sourceLatestSeq: matchProtocolArchives.sourceLatestSeq,
      protocolVersion: matchProtocolArchives.protocolVersion,
      rowsJson: matchProtocolArchives.rowsJson,
      snapshotJson: matchProtocolArchives.snapshotJson,
    })
    .from(matchProtocolArchives)
    .where(eq(matchProtocolArchives.matchId, matchId))
    .get()
  if (!row) return null
  try {
    const parsed = v.parse(ProtocolArchiveStorageRowSchema, row)
    if (parsed.matchId !== matchId) throw new Error('Archive row match ID does not match request')
    const { matchId: _matchId, ...archive } = parsed
    return archive
  } catch {
    if (row.protocolVersion !== PROTOCOL_ARCHIVE_VERSION) {
      throw new UnsupportedProtocolArchiveVersionError(matchId, row.protocolVersion)
    }
    throw new ProtocolArchiveCorruptionError(matchId)
  }
}
