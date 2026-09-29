import type { MatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import { eq } from 'drizzle-orm'

import { sparringMatches, StoredMatchStatus } from '../schema'
import type { ApplicationDatabase } from '../types'

export type ActiveMatchCatalogInput = {
  matchId: MatchId
  gameKey: GameKey
  seatAPlayerRef: PlayerRef
  seatBPlayerRef: PlayerRef
  createdAt: UnixEpochMilliseconds
}

export async function beginMatchCreation(
  db: ApplicationDatabase,
  input: ActiveMatchCatalogInput,
): Promise<void> {
  await db
    .insert(sparringMatches)
    .values({
      matchId: input.matchId,
      gameKey: input.gameKey,
      seatAPlayerRef: input.seatAPlayerRef,
      seatBPlayerRef: input.seatBPlayerRef,
      status: StoredMatchStatus.creating,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing({ target: sparringMatches.matchId })

  const stored = await db
    .select({
      gameKey: sparringMatches.gameKey,
      seatAPlayerRef: sparringMatches.seatAPlayerRef,
      seatBPlayerRef: sparringMatches.seatBPlayerRef,
      status: sparringMatches.status,
      createdAt: sparringMatches.createdAt,
    })
    .from(sparringMatches)
    .where(eq(sparringMatches.matchId, input.matchId))
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
  await db
    .update(sparringMatches)
    .set({ status: StoredMatchStatus.active })
    .where(eq(sparringMatches.matchId, matchId))
}
