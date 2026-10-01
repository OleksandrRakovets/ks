import type { PlayerRef } from '@ks/core'

import type { guestPlayers } from '../../d1/schema'

export type PlayerName = Readonly<{ firstName: string; lastName: string }>

export type ParticipantRecord = Readonly<{
  playerRef: PlayerRef
  names: Readonly<{ uk: PlayerName; en: PlayerName }> | null
}>

export function participantRecordFromRow(
  playerRef: PlayerRef,
  row: LocalizedPlayerRow | null,
): ParticipantRecord {
  return {
    playerRef,
    names: row
      ? {
          uk: { firstName: row.firstNameUk, lastName: row.lastNameUk },
          en: { firstName: row.firstNameEn, lastName: row.lastNameEn },
        }
      : null,
  }
}

type LocalizedPlayerRow = Pick<
  typeof guestPlayers.$inferSelect,
  'firstNameUk' | 'lastNameUk' | 'firstNameEn' | 'lastNameEn'
>
