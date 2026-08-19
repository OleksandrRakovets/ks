import type { SupportedLocale } from '@ks/i18n'

import type { AppEnv } from './context'

type LocalizedPlayerRow = {
  first_name_uk: string
  last_name_uk: string
  first_name_en: string
  last_name_en: string
}

type HydratedParticipant = {
  playerRef: string
  displayName: string
  shortDisplayName: string
}

type PlayerName = { firstName: string; lastName: string }

function formatDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim()
}

function formatShortDisplayName(firstName: string, lastName: string): string {
  const initial = firstName.trim().charAt(0)
  return initial ? `${initial}. ${lastName}`.trim() : lastName.trim()
}

function selectLocalizedNames(row: LocalizedPlayerRow, locale: SupportedLocale): PlayerName {
  if (locale === 'en') {
    return {
      firstName: row.first_name_en,
      lastName: row.last_name_en,
    }
  }

  return {
    firstName: row.first_name_uk,
    lastName: row.last_name_uk,
  }
}

async function loadPlayerRow(env: AppEnv, playerRef: string): Promise<LocalizedPlayerRow | null> {
  if (playerRef.startsWith('gp_')) {
    const guestPlayerId = playerRef.slice(3)
    return await env.DB.prepare(
      'SELECT first_name_uk, last_name_uk, first_name_en, last_name_en FROM guest_players WHERE guest_player_id = ?',
    )
      .bind(guestPlayerId)
      .first<LocalizedPlayerRow>()
  }

  if (playerRef.startsWith('vp_')) {
    const verifiedPlayerId = playerRef.slice(3)
    return await env.DB.prepare(
      'SELECT first_name_uk, last_name_uk, first_name_en, last_name_en FROM verified_players WHERE verified_player_id = ?',
    )
      .bind(verifiedPlayerId)
      .first<LocalizedPlayerRow>()
  }

  return null
}

export async function hydrateParticipant(
  env: AppEnv,
  playerRef: string,
  locale: SupportedLocale,
): Promise<HydratedParticipant> {
  const row = await loadPlayerRow(env, playerRef)
  if (!row) {
    return {
      playerRef,
      displayName: playerRef,
      shortDisplayName: playerRef,
    }
  }

  const { firstName, lastName } = selectLocalizedNames(row, locale)
  return {
    playerRef,
    displayName: formatDisplayName(firstName, lastName),
    shortDisplayName: formatShortDisplayName(firstName, lastName),
  }
}
