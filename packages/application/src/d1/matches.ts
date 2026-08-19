import { normalizeMatchId } from '@ks/competition'
import { eq, sql } from 'drizzle-orm'

import { matches } from './schema'
import type { ApplicationDatabase } from './types'

export async function listMatchRows(db: ApplicationDatabase) {
  return await db
    .select({
      matchId: matches.matchId,
      gameKey: matches.gameKey,
      status: matches.status,
      createdAt: matches.createdAt,
      seatAPlayerRef: matches.seatAPlayerRef,
      seatBPlayerRef: matches.seatBPlayerRef,
    })
    .from(matches)
    .orderBy(sql`CASE WHEN ${matches.status} = 'finished' THEN 1 ELSE 0 END`, sql`${matches.createdAt} DESC`)
}

export async function getMatchParticipantRefs(
  db: ApplicationDatabase,
  matchId: string,
): Promise<{ A: string; B: string } | null> {
  const row = await db
    .select({ A: matches.seatAPlayerRef, B: matches.seatBPlayerRef })
    .from(matches)
    .where(eq(matches.matchId, normalizeMatchId(matchId)))
    .get()
  return row ?? null
}
