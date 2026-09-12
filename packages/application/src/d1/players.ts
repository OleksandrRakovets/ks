import { GuestPlayerId, HydratedMatchParticipant, type PlayerRef, VerifiedPlayerId } from '@ks/core'
import type { SupportedLocale } from '@ks/i18n'
import { eq } from 'drizzle-orm'
import * as v from 'valibot'

import { guestPlayers, verifiedPlayers } from './schema'
import type { ApplicationDatabase } from './types'

type LocalizedPlayerRow = {
  firstNameUk: string
  lastNameUk: string
  firstNameEn: string
  lastNameEn: string
}

async function loadPlayerRow(
  db: ApplicationDatabase,
  playerRef: PlayerRef,
): Promise<LocalizedPlayerRow | null> {
  if (playerRef.startsWith('gp_')) {
    const guestPlayerId = v.parse(GuestPlayerId, playerRef.slice(3))

    return (
      (await db
        .select({
          firstNameUk: guestPlayers.firstNameUk,
          lastNameUk: guestPlayers.lastNameUk,
          firstNameEn: guestPlayers.firstNameEn,
          lastNameEn: guestPlayers.lastNameEn,
        })
        .from(guestPlayers)
        .where(eq(guestPlayers.guestPlayerId, guestPlayerId))
        .get()) ?? null
    )
  }

  if (playerRef.startsWith('vp_')) {
    const verifiedPlayerId = v.parse(VerifiedPlayerId, playerRef.slice(3))

    return (
      (await db
        .select({
          firstNameUk: verifiedPlayers.firstNameUk,
          lastNameUk: verifiedPlayers.lastNameUk,
          firstNameEn: verifiedPlayers.firstNameEn,
          lastNameEn: verifiedPlayers.lastNameEn,
        })
        .from(verifiedPlayers)
        .where(eq(verifiedPlayers.verifiedPlayerId, verifiedPlayerId))
        .get()) ?? null
    )
  }

  return null
}

export async function hydrateParticipant(
  db: ApplicationDatabase,
  playerRef: PlayerRef,
  locale: SupportedLocale,
): Promise<HydratedMatchParticipant> {
  const row = await loadPlayerRow(db, playerRef)

  if (!row)
    return v.parse(HydratedMatchParticipant, {
      playerRef,
      displayName: playerRef,
      shortDisplayName: playerRef,
    })

  const firstName = locale === 'en' ? row.firstNameEn : row.firstNameUk
  const lastName = locale === 'en' ? row.lastNameEn : row.lastNameUk
  const displayName = `${firstName} ${lastName}`.trim()
  const initial = firstName.trim().charAt(0)

  return v.parse(HydratedMatchParticipant, {
    playerRef,
    displayName,
    shortDisplayName: initial ? `${initial}. ${lastName}`.trim() : lastName.trim(),
  })
}
