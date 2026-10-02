import { HydratedMatchParticipant } from '@ks/core'
import type { SupportedLocale } from '@ks/i18n'
import { Schema } from 'effect'

import type { ParticipantRecord, PlayerName } from './storage/records'

export function splitGuestDisplayName(displayName: string): PlayerName {
  const parts = displayName.split(' ')

  if (parts.length <= 1) return { firstName: '', lastName: displayName }

  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

export function presentParticipant(
  participant: ParticipantRecord,
  locale: SupportedLocale,
): typeof HydratedMatchParticipant.Type {
  const { playerRef, names } = participant

  if (!names)
    return Schema.decodeUnknownSync(HydratedMatchParticipant)({
      playerRef,
      displayName: playerRef,
      shortDisplayName: playerRef,
    })

  const { firstName, lastName } = locale === 'en' ? names.en : names.uk
  const displayName = `${firstName} ${lastName}`.trim()
  const initial = firstName.trim().charAt(0)

  return Schema.decodeUnknownSync(HydratedMatchParticipant)({
    playerRef,
    displayName,
    shortDisplayName: initial ? `${initial}. ${lastName}`.trim() : lastName.trim(),
  })
}
