import { parseProtocolEntryContent } from '@ks/competition'
import { type MatchId, MatchIdSchema, MatchStateSchema, NonEmptyProtocolEntries, PositiveIntegerSchema } from '@ks/core'
import { isRegisteredGameKey } from '@ks/gameplay/definitions'
import { eq } from 'drizzle-orm'
import * as v from 'valibot'

import {
  PROTOCOL_ARCHIVE_VERSION,
  ProtocolArchiveCorruptionError,
  type ProtocolArchiveRecord,
  UnsupportedProtocolArchiveVersionError,
} from '../protocol'
import { matchProtocolArchives } from './schema'
import type { ApplicationDatabase } from './types'

const ProtocolArchiveStorageRowSchema = v.pipe(
  v.object({
    matchId: MatchIdSchema,
    sourceLatestSeq: PositiveIntegerSchema,
    protocolVersion: v.literal(PROTOCOL_ARCHIVE_VERSION),
    rowsJson: v.pipe(v.string(), v.parseJson(), NonEmptyProtocolEntries),
    stateJson: v.pipe(v.string(), v.parseJson(), MatchStateSchema),
  }),
  v.transform(({ rowsJson, stateJson, ...row }) => ({ ...row, entries: rowsJson, state: stateJson })),
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
    const { matchId: _matchId, entries, ...archive } = parsed
    const gameKey = archive.state.gameKey
    return {
      ...archive,
      entries: isRegisteredGameKey(gameKey)
        ? entries.map((entry) => {
            const { acceptedSeq, entryIndex, causedByCommandId, acceptedAt, ...content } = entry
            if (content.gameKey !== gameKey) throw new Error('Protocol archive game key mismatch')
            return {
              acceptedSeq,
              entryIndex,
              causedByCommandId,
              acceptedAt,
              ...parseProtocolEntryContent(content),
            }
          })
        : entries,
    }
  } catch {
    if (row.protocolVersion !== PROTOCOL_ARCHIVE_VERSION) {
      throw new UnsupportedProtocolArchiveVersionError(matchId, row.protocolVersion)
    }
    throw new ProtocolArchiveCorruptionError(matchId)
  }
}
