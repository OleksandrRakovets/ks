import type { UnixEpochMilliseconds } from '@ks/core'
import { eq } from 'drizzle-orm'

import { matchProtocolArchives, matches, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

export type ActiveMatchCatalogInput = {
  matchId: string
  gameKey: string
  seatAPlayerRef: string
  seatBPlayerRef: string
  createdAt: UnixEpochMilliseconds
}

export async function beginMatchCreation(db: ApplicationDatabase, input: ActiveMatchCatalogInput): Promise<void> {
  await db
    .insert(matches)
    .values({
      matchId: input.matchId,
      gameKey: input.gameKey,
      seatAPlayerRef: input.seatAPlayerRef,
      seatBPlayerRef: input.seatBPlayerRef,
      status: StoredMatchStatus.creating,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing({ target: matches.matchId })

  const stored = await db
    .select({
      gameKey: matches.gameKey,
      seatAPlayerRef: matches.seatAPlayerRef,
      seatBPlayerRef: matches.seatBPlayerRef,
      status: matches.status,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .where(eq(matches.matchId, input.matchId))
    .get()

  if (
    !stored ||
    stored.gameKey !== input.gameKey ||
    stored.seatAPlayerRef !== input.seatAPlayerRef ||
    stored.seatBPlayerRef !== input.seatBPlayerRef ||
    (stored.status !== StoredMatchStatus.creating && stored.status !== StoredMatchStatus.active) ||
    stored.createdAt !== input.createdAt
  ) {
    throw new Error('Match catalog entry conflicts with room creation')
  }
}

export async function activateMatch(db: ApplicationDatabase, matchId: string): Promise<void> {
  await db.update(matches).set({ status: StoredMatchStatus.active }).where(eq(matches.matchId, matchId))
}

export async function recordCompletedMatch(
  db: ApplicationDatabase,
  input: {
    matchId: string
    sourceLatestSeq: number
    protocolVersion: number
    rowsJson: string
    endedAt: UnixEpochMilliseconds
  },
): Promise<void> {
  await db.batch([
    db
      .insert(matchProtocolArchives)
      .values({
        matchId: input.matchId,
        sourceLatestSeq: input.sourceLatestSeq,
        protocolVersion: input.protocolVersion,
        rowsJson: input.rowsJson,
        createdAt: input.endedAt,
      })
      .onConflictDoUpdate({
        target: matchProtocolArchives.matchId,
        set: {
          sourceLatestSeq: input.sourceLatestSeq,
          protocolVersion: input.protocolVersion,
          rowsJson: input.rowsJson,
          createdAt: input.endedAt,
        },
      })
      .returning(),
    db
      .update(matches)
      .set({ status: StoredMatchStatus.finished, endedAt: input.endedAt })
      .where(eq(matches.matchId, input.matchId))
      .returning(),
  ])
}
