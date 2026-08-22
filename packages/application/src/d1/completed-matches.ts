import { deriveMatchSnapshot } from '@ks/competition'
import type { MatchId, StoredMatchFact, UnixEpochMilliseconds } from '@ks/core'
import { and, eq, inArray } from 'drizzle-orm'

import { prepareProtocolRowsForArchive, PROTOCOL_ARCHIVE_VERSION } from '../protocol'
import { matches, matchProtocolArchives, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

export type CompletedMatchArchiveInput = {
  matchId: MatchId
  sourceLatestSeq: number
  endedAt: UnixEpochMilliseconds
  facts: StoredMatchFact[]
}

export async function archiveCompletedMatch(db: ApplicationDatabase, input: CompletedMatchArchiveInput): Promise<void> {
  const archive = {
    matchId: input.matchId,
    sourceLatestSeq: input.sourceLatestSeq,
    protocolVersion: PROTOCOL_ARCHIVE_VERSION,
    rowsJson: JSON.stringify(prepareProtocolRowsForArchive(input.facts)),
    snapshotJson: JSON.stringify(deriveMatchSnapshot(input.facts, input.sourceLatestSeq)),
    createdAt: input.endedAt,
  }

  await db.batch([
    db.insert(matchProtocolArchives).values(archive).onConflictDoNothing({ target: matchProtocolArchives.matchId }),
    db
      .update(matches)
      .set({ status: StoredMatchStatus.finalizing, endedAt: input.endedAt })
      .where(
        and(
          eq(matches.matchId, input.matchId),
          inArray(matches.status, [StoredMatchStatus.active, StoredMatchStatus.finalizing]),
        ),
      ),
  ])

  const [storedArchive, storedMatch] = await Promise.all([
    db.select().from(matchProtocolArchives).where(eq(matchProtocolArchives.matchId, input.matchId)).get(),
    db
      .select({ status: matches.status, endedAt: matches.endedAt })
      .from(matches)
      .where(eq(matches.matchId, input.matchId))
      .get(),
  ])
  if (
    !storedArchive ||
    storedArchive.sourceLatestSeq !== archive.sourceLatestSeq ||
    storedArchive.protocolVersion !== archive.protocolVersion ||
    storedArchive.rowsJson !== archive.rowsJson ||
    storedArchive.snapshotJson !== archive.snapshotJson ||
    storedArchive.createdAt !== archive.createdAt ||
    !storedMatch ||
    (storedMatch.status !== StoredMatchStatus.finalizing && storedMatch.status !== StoredMatchStatus.finished) ||
    storedMatch.endedAt !== input.endedAt
  ) {
    throw new Error('Completed match archive conflicts with existing data')
  }
}

export async function finishCompletedMatch(db: ApplicationDatabase, matchId: MatchId): Promise<void> {
  const result = await db
    .update(matches)
    .set({ status: StoredMatchStatus.finished })
    .where(
      and(eq(matches.matchId, matchId), inArray(matches.status, [StoredMatchStatus.finalizing, StoredMatchStatus.finished])),
    )
    .returning({ status: matches.status })
  if (result.length !== 1 || result[0]?.status !== StoredMatchStatus.finished) {
    throw new Error('Completed match is not ready to finish')
  }
}
