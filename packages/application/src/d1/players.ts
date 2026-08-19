import type { SupportedLocale } from '@ks/i18n'

import type { HydratedParticipant } from '../contracts'
import type { ApplicationDatabase } from './types'

type LocalizedPlayerRow = {
  first_name_uk: string
  last_name_uk: string
  first_name_en: string
  last_name_en: string
}

async function loadPlayerRow(db: ApplicationDatabase, playerRef: string): Promise<LocalizedPlayerRow | null> {
  if (playerRef.startsWith('gp_')) {
    return await db
      .prepare('SELECT first_name_uk, last_name_uk, first_name_en, last_name_en FROM guest_players WHERE guest_player_id = ?')
      .bind(playerRef.slice(3))
      .first<LocalizedPlayerRow>()
  }

  if (playerRef.startsWith('vp_')) {
    return await db
      .prepare(
        'SELECT first_name_uk, last_name_uk, first_name_en, last_name_en FROM verified_players WHERE verified_player_id = ?',
      )
      .bind(playerRef.slice(3))
      .first<LocalizedPlayerRow>()
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

  const firstName = locale === 'en' ? row.first_name_en : row.first_name_uk
  const lastName = locale === 'en' ? row.last_name_en : row.last_name_uk
  const displayName = `${firstName} ${lastName}`.trim()
  const initial = firstName.trim().charAt(0)
  return {
    playerRef,
    displayName,
    shortDisplayName: initial ? `${initial}. ${lastName}`.trim() : lastName.trim(),
  }
}
