import type { MatchId } from '@ks/core'
import { eq, inArray, sql } from 'drizzle-orm'

import { matches, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

const visibleMatchStatuses = [StoredMatchStatus.active, StoredMatchStatus.finished]

export async function countMatchRows(db: ApplicationDatabase): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(matches)
    .where(inArray(matches.status, visibleMatchStatuses))
    .get()

  return result?.count ?? 0
}

export async function listMatchRows(db: ApplicationDatabase) {
  return db
    .select({
      matchId: matches.matchId,
      gameKey: matches.gameKey,
      status: matches.status,
      createdAt: matches.createdAt,
      seatAPlayerRef: matches.seatAPlayerRef,
      seatBPlayerRef: matches.seatBPlayerRef,
    })
    .from(matches)
    .where(inArray(matches.status, visibleMatchStatuses))
    .orderBy(
      sql`CASE WHEN ${matches.status} = ${StoredMatchStatus.finished} THEN 1 ELSE 0 END`,
      sql`${matches.createdAt} DESC`,
    )
}

export async function getMatchRow(db: ApplicationDatabase, matchId: MatchId) {
  return (
    (await db
      .select({
        matchId: matches.matchId,
        gameKey: matches.gameKey,
        status: matches.status,
        createdAt: matches.createdAt,
        seatAPlayerRef: matches.seatAPlayerRef,
        seatBPlayerRef: matches.seatBPlayerRef,
      })
      .from(matches)
      .where(eq(matches.matchId, matchId))
      .get()) ?? null
  )
}
