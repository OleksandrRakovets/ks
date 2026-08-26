import type { MatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { eq } from 'drizzle-orm'

import { matches, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

export type ActiveMatchCatalogInput = {
  matchId: MatchId
  gameKey: RegisteredGameKey
  seatAPlayerRef: PlayerRef
  seatBPlayerRef: PlayerRef
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
    throw new Error('Match row conflicts with room creation')
  }
}

export async function activateMatch(db: ApplicationDatabase, matchId: MatchId): Promise<void> {
  await db.update(matches).set({ status: StoredMatchStatus.active }).where(eq(matches.matchId, matchId))
}
