import type { SupportedLocale } from '@ks/i18n'
import { eq } from 'drizzle-orm'

import type { HydratedParticipant } from '../contracts'
import { guestPlayers, verifiedPlayers } from './schema'
import type { ApplicationDatabase } from './types'

type LocalizedPlayerRow = {
  firstNameUk: string
  lastNameUk: string
  firstNameEn: string
  lastNameEn: string
}

async function loadPlayerRow(db: ApplicationDatabase, playerRef: string): Promise<LocalizedPlayerRow | null> {
  if (playerRef.startsWith('gp_')) {
    return (
      (await db
        .select({
          firstNameUk: guestPlayers.firstNameUk,
          lastNameUk: guestPlayers.lastNameUk,
          firstNameEn: guestPlayers.firstNameEn,
          lastNameEn: guestPlayers.lastNameEn,
        })
        .from(guestPlayers)
        .where(eq(guestPlayers.guestPlayerId, playerRef.slice(3)))
        .get()) ?? null
    )
  }

  if (playerRef.startsWith('vp_')) {
    return (
      (await db
        .select({
          firstNameUk: verifiedPlayers.firstNameUk,
          lastNameUk: verifiedPlayers.lastNameUk,
          firstNameEn: verifiedPlayers.firstNameEn,
          lastNameEn: verifiedPlayers.lastNameEn,
        })
        .from(verifiedPlayers)
        .where(eq(verifiedPlayers.verifiedPlayerId, playerRef.slice(3)))
        .get()) ?? null
    )
  }

  return null
}

export async function hydrateParticipant(
  db: ApplicationDatabase,
  playerRef: string,
  locale: SupportedLocale,
): Promise<HydratedParticipant> {
  const row = await loadPlayerRow(db, playerRef)
  if (!row) return { playerRef, displayName: playerRef, shortDisplayName: playerRef }

  const firstName = locale === 'en' ? row.firstNameEn : row.firstNameUk
  const lastName = locale === 'en' ? row.lastNameEn : row.lastNameUk
  const displayName = `${firstName} ${lastName}`.trim()
  const initial = firstName.trim().charAt(0)
  return {
    playerRef,
    displayName,
    shortDisplayName: initial ? `${initial}. ${lastName}`.trim() : lastName.trim(),
  }
}
