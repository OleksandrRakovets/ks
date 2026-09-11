import { formatPlayerRef, newGuestPlayerId, nowUnixEpochMilliseconds, type PlayerRef } from '@ks/core'
import { and, eq } from 'drizzle-orm'

import { guestPlayers } from './schema'
import type { ApplicationDatabase } from './types'

type PlayerName = { firstName: string; lastName: string }

function splitGuestDisplayName(displayName: string): PlayerName {
  const parts = displayName.split(' ')

  if (parts.length <= 1) return { firstName: '', lastName: displayName }

  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

export async function getOrCreateGuestPlayerRef(
  db: ApplicationDatabase,
  displayName: string,
): Promise<PlayerRef> {
  const { firstName, lastName } = splitGuestDisplayName(displayName)

  const existing = await db
    .select({ guestPlayerId: guestPlayers.guestPlayerId })
    .from(guestPlayers)
    .where(
      and(
        eq(guestPlayers.firstNameUk, firstName),
        eq(guestPlayers.lastNameUk, lastName),
        eq(guestPlayers.firstNameEn, firstName),
        eq(guestPlayers.lastNameEn, lastName),
      ),
    )
    .limit(1)

  if (existing[0]?.guestPlayerId) return formatPlayerRef('gp', existing[0].guestPlayerId)

  const guestPlayerId = newGuestPlayerId()
  await db.insert(guestPlayers).values({
    guestPlayerId,
    firstNameUk: firstName,
    lastNameUk: lastName,
    firstNameEn: firstName,
    lastNameEn: lastName,
    createdAt: nowUnixEpochMilliseconds(),
  })

  return formatPlayerRef('gp', guestPlayerId)
}
