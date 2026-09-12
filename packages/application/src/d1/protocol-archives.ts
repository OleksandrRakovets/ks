import { parseProtocolEntryContent } from '@ks/competition'
import { MatchId, MatchState, PositiveInteger, ProtocolEntries, type ProtocolEntry } from '@ks/core'
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

const ProtocolArchiveStorageRow = v.pipe(
  v.object({
    matchId: MatchId,
    sourceLatestSeq: PositiveInteger,
    protocolVersion: v.literal(PROTOCOL_ARCHIVE_VERSION),
    rowsJson: v.pipe(v.string(), v.parseJson(), ProtocolEntries),
    stateJson: v.pipe(v.string(), v.parseJson(), MatchState),
  }),
  v.transform(({ rowsJson, stateJson, ...row }) => ({ ...row, entries: rowsJson, state: stateJson })),
  v.check((value) => value.state.status === 'finished', 'Archive state is not finished'),
  v.check((value) => value.state.matchId === value.matchId, 'Archive match ID does not match state'),
)

export async function getProtocolArchive(
  db: ApplicationDatabase,
  matchId: MatchId,
): Promise<ProtocolArchiveRecord | null> {
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
    const parsed = v.parse(ProtocolArchiveStorageRow, row)
    const { matchId: _matchId, entries, ...archive } = parsed
    const gameKey = archive.state.gameKey

    const normalizeEntry = (entry: ProtocolEntry): ProtocolEntry => {
      const { acceptedSeq, entryIndex, causedByCommandId, acceptedAt, ...content } = entry

      if (content.gameKey !== gameKey) throw new Error('Protocol archive game key mismatch')

      return {
        acceptedSeq,
        entryIndex,
        causedByCommandId,
        acceptedAt,
        ...parseProtocolEntryContent(content),
      }
    }

    const normalizedEntries = isRegisteredGameKey(gameKey) ? entries.map(normalizeEntry) : entries

    return {
      ...archive,
      entries: normalizedEntries,
    }
  } catch {
    if (!isSupportedProtocolArchiveVersion(row.protocolVersion)) {
      throw new UnsupportedProtocolArchiveVersionError(matchId, row.protocolVersion)
    }

    throw new ProtocolArchiveCorruptionError(matchId)
  }
}

function isSupportedProtocolArchiveVersion(version: number): boolean {
  return version === PROTOCOL_ARCHIVE_VERSION
}
