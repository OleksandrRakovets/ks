import { parseProtocolEntryContent } from '@ks/competition'
import { MatchId, MatchState, PositiveInteger, ProtocolEntries, type ProtocolEntry } from '@ks/core'
import { GameResult, isRegisteredGameKey } from '@ks/gameplay/definitions'
import { eq } from 'drizzle-orm'
import * as v from 'valibot'

import {
  type FinishedMatchArchiveRecord,
  PROTOCOL_ARCHIVE_VERSION,
  ProtocolArchiveCorruptionError,
  type ProtocolArchiveRecord,
  UnsupportedProtocolArchiveVersionError,
} from '../protocol'
import { sparringMatchArchives } from './schema'
import type { ApplicationDatabase } from './types'

const ArchiveStateStorageRow = v.pipe(
  v.object({
    matchId: MatchId,
    sourceLatestSeq: PositiveInteger,
    stateJson: v.pipe(v.string(), v.parseJson(), MatchState),
    gameResultJson: v.nullable(v.pipe(v.string(), v.parseJson(), GameResult)),
  }),
  v.transform(({ stateJson, gameResultJson, ...row }) => ({
    ...row,
    state: stateJson,
    gameResult: gameResultJson,
  })),
  v.check((value) => value.state.status === 'finished', 'Archive state is not finished'),
  v.check((value) => value.state.matchId === value.matchId, 'Archive match ID does not match state'),
  v.check(
    (value) =>
      value.state.gameKey === 'free-pyramid-long'
        ? value.gameResult?.gameKey === value.state.gameKey
        : value.gameResult === null,
    'Archive game result does not match game',
  ),
)

const archiveStateSelection = {
  matchId: sparringMatchArchives.matchId,
  sourceLatestSeq: sparringMatchArchives.sourceLatestSeq,
  stateJson: sparringMatchArchives.stateJson,
  gameResultJson: sparringMatchArchives.gameResultJson,
}

export async function getFinishedMatchArchive(
  db: ApplicationDatabase,
  matchId: MatchId,
): Promise<FinishedMatchArchiveRecord | null> {
  const row = await db
    .select(archiveStateSelection)
    .from(sparringMatchArchives)
    .where(eq(sparringMatchArchives.matchId, matchId))
    .get()

  if (!row) return null

  try {
    const { matchId: _matchId, ...archive } = v.parse(ArchiveStateStorageRow, row)

    return archive
  } catch {
    throw new ProtocolArchiveCorruptionError(matchId)
  }
}

export async function getProtocolArchive(
  db: ApplicationDatabase,
  matchId: MatchId,
): Promise<ProtocolArchiveRecord | null> {
  const row = await db
    .select({
      ...archiveStateSelection,
      protocolVersion: sparringMatchArchives.protocolVersion,
      rowsJson: sparringMatchArchives.rowsJson,
    })
    .from(sparringMatchArchives)
    .where(eq(sparringMatchArchives.matchId, matchId))
    .get()

  if (!row) return null

  try {
    const { matchId: _matchId, ...archive } = v.parse(ArchiveStateStorageRow, row)
    const protocolVersion = v.parse(v.literal(PROTOCOL_ARCHIVE_VERSION), row.protocolVersion)
    const entries = v.parse(v.pipe(v.string(), v.parseJson(), ProtocolEntries), row.rowsJson)
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
      protocolVersion,
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
