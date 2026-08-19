import { formatPlayerRef, newGuestPlayerId, type PlayerRef } from '@ks/core'

import type { AppEnv } from './context'

type GuestPlayerIdRow = {
  guest_player_id: string
}

type PlayerName = { firstName: string; lastName: string }

function splitGuestDisplayName(displayName: string): PlayerName {
  const parts = displayName.split(' ')
  if (parts.length <= 1) {
    return {
      firstName: '',
      lastName: displayName,
    }
  }

  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

export async function getOrCreateGuestPlayerRef(env: AppEnv, displayName: string): Promise<PlayerRef> {
  const { firstName, lastName } = splitGuestDisplayName(displayName)

  const existing = await env.DB.prepare(
    [
      'SELECT guest_player_id FROM guest_players',
      'WHERE first_name_uk = ? AND last_name_uk = ?',
      'AND first_name_en = ? AND last_name_en = ?',
      'LIMIT 1',
    ].join(' '),
  )
    .bind(firstName, lastName, firstName, lastName)
    .first<GuestPlayerIdRow>()

  if (existing?.guest_player_id) {
    return formatPlayerRef('gp', existing.guest_player_id)
  }

  const guestPlayerId = newGuestPlayerId()
  await env.DB.prepare(
    [
      'INSERT INTO guest_players (',
      'guest_player_id, first_name_uk, last_name_uk, first_name_en, last_name_en, created_at',
      ') VALUES (?, ?, ?, ?, ?, ?)',
    ].join(' '),
  )
    .bind(guestPlayerId, firstName, lastName, firstName, lastName, Date.now())
    .run()

  return formatPlayerRef('gp', guestPlayerId)
}
