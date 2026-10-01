import {
  type Clock,
  formatPlayerRef,
  GuestPlayerId,
  newGuestPlayerId,
  type PlayerRef,
  VerifiedPlayerId,
} from '@ks/core'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'

import type { ApplicationDatabase } from '../../d1/database'
import { guestPlayers, verifiedPlayers } from '../../d1/schema'
import type { ParticipantRecord, PlayerName } from '../records'

export class PlayerRepository {
  readonly #db: ApplicationDatabase
  readonly #clock: Clock

  constructor(db: ApplicationDatabase, clock: Clock) {
    this.#db = db
    this.#clock = clock
  }

  async ensureGuestRef({ firstName, lastName }: PlayerName): Promise<PlayerRef> {
    const existing = await this.#db
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
    await this.#db.insert(guestPlayers).values({
      guestPlayerId,
      firstNameUk: firstName,
      lastNameUk: lastName,
      firstNameEn: firstName,
      lastNameEn: lastName,
      createdAt: this.#clock.nowMs(),
    })

    return formatPlayerRef('gp', guestPlayerId)
  }

  async readParticipant(playerRef: PlayerRef): Promise<ParticipantRecord> {
    return participantRecordFromRow(playerRef, await this.#selectPlayerRow(playerRef))
  }

  async #selectPlayerRow(playerRef: PlayerRef) {
    if (playerRef.startsWith('gp_')) {
      const guestPlayerId = v.parse(GuestPlayerId, playerRef.slice(3))

      return (
        (await this.#db
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
        (await this.#db
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
}

type LocalizedPlayerRow = Pick<
  typeof guestPlayers.$inferSelect,
  'firstNameUk' | 'lastNameUk' | 'firstNameEn' | 'lastNameEn'
>

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
