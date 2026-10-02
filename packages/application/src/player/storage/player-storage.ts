import { formatPlayerRef, GuestPlayerId, newGuestPlayerId, type PlayerRef, VerifiedPlayerId } from '@ks/core'
import { and, eq } from 'drizzle-orm'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Context, Effect, Layer } from 'effect'
import * as v from 'valibot'

import { ApplicationDatabase } from '../../d1/client'
import { guestPlayers, verifiedPlayers } from '../../d1/schema'
import { ApplicationStorageError } from '../../d1/storage-error'
import { ApplicationClock } from '../../match/clock'
import { type ParticipantRecord, participantRecordFromRow, type PlayerName } from './records'

export class PlayerStorage extends Context.Service<PlayerStorage>()(
  '@ks/application/player/storage/player-storage',
  {
    make: Effect.gen(function* () {
      const db = yield* ApplicationDatabase
      const clock = yield* ApplicationClock

      const selectPlayerRow = Effect.fnUntraced(function* (playerRef: PlayerRef) {
        if (playerRef.startsWith('gp_')) {
          const guestPlayerId = v.parse(GuestPlayerId, playerRef.slice(3))

          return (
            (yield* db
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
            (yield* db
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
      })

      const ensureGuestRef = Effect.fnUntraced(function* ({ firstName, lastName }: PlayerName) {
        const existing = yield* db
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
        yield* db.insert(guestPlayers).values({
          guestPlayerId,
          firstNameUk: firstName,
          lastNameUk: lastName,
          firstNameEn: firstName,
          lastNameEn: lastName,
          createdAt: clock.nowMs(),
        })

        return formatPlayerRef('gp', guestPlayerId)
      }, mapStorageError)

      const readParticipant = Effect.fnUntraced(function* (
        playerRef: PlayerRef,
      ): Effect.fn.Return<ParticipantRecord, EffectDrizzleQueryError> {
        return participantRecordFromRow(playerRef, yield* selectPlayerRow(playerRef))
      }, mapStorageError)

      return { ensureGuestRef, readParticipant }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}

const mapStorageError = Effect.mapError(
  (cause: EffectDrizzleQueryError) => new ApplicationStorageError({ cause }),
)
