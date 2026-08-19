import { eq } from 'drizzle-orm'

import { matchProtocolArchives, matches } from './schema'
import type { ApplicationDatabase } from './types'

export type ActiveMatchCatalogInput = {
  matchId: string
  gameKey: string
  seatAPlayerRef: string
  seatBPlayerRef: string
  createdAt: number
}

export async function registerActiveMatch(db: ApplicationDatabase, input: ActiveMatchCatalogInput): Promise<void> {
  await db
    .insert(matches)
    .values({
      matchId: input.matchId,
      gameKey: input.gameKey,
      seatAPlayerRef: input.seatAPlayerRef,
      seatBPlayerRef: input.seatBPlayerRef,
      status: 'active',
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
    stored.status !== 'active' ||
    stored.createdAt !== input.createdAt
  ) {
    throw new Error('Match catalog entry conflicts with active room')
  }
}

export async function recordCompletedMatch(
  db: ApplicationDatabase,
  input: {
    matchId: string
    sourceLatestSeq: number
    protocolVersion: number
    rowsJson: string
    endedAt: number
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
      .set({ status: 'finished', endedAt: input.endedAt })
      .where(eq(matches.matchId, input.matchId))
      .returning(),
  ])
}
