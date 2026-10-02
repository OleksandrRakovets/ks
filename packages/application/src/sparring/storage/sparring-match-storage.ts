import { projectMatchScore } from '@ks/competition'
import type { MatchId, UnixEpochMilliseconds } from '@ks/core'
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { alias } from 'drizzle-orm/sqlite-core'
import { Context, Effect, Layer } from 'effect'
import * as v from 'valibot'

import { ApplicationDatabase } from '../../d1/client'
import {
  guestPlayers,
  sparringMatchArchives,
  sparringMatches,
  StoredMatchStatus,
  verifiedPlayers,
} from '../../d1/schema'
import { ApplicationStorageError } from '../../d1/storage-error'
import type { MatchRoomArchiveTransfer } from '../../match/match-room'
import {
  encodeProtocolArchive,
  finishedMatchArchiveRecordFromRow,
  MatchFinalizationError,
  protocolArchiveRecordFromRow,
  semanticArchiveEqual,
} from './protocol-archive'
import {
  type FinishedMatchArchiveRecord,
  type MatchCreationRecord,
  matchListRecordFromRow,
  type MatchRecord,
  matchRecordFromRow,
  MatchRow,
  type ProtocolArchiveRecord,
} from './records'

export class SparringMatchStorage extends Context.Service<SparringMatchStorage>()(
  '@ks/application/sparring/storage/sparring-match-storage',
  {
    make: Effect.gen(function* () {
      const db = yield* ApplicationDatabase

      const selectArchiveRow = (matchId: MatchId) =>
        db.select().from(sparringMatchArchives).where(eq(sparringMatchArchives.matchId, matchId)).get()

      /** Match only the ref's player kind; strip its prefix on the match side so each player PK stays indexed. */
      const selectJoinedMatchRows = () =>
        db
          .select({ ...matchRowSelection, seatAGuest, seatAVerified, seatBGuest, seatBVerified })
          .from(sparringMatches)
          .leftJoin(
            seatAGuest,
            and(
              sql`${sparringMatches.seatAPlayerRef} GLOB 'gp_*'`,
              eq(seatAGuest.guestPlayerId, sql`substr(${sparringMatches.seatAPlayerRef}, 4)`),
            ),
          )
          .leftJoin(
            seatAVerified,
            and(
              sql`${sparringMatches.seatAPlayerRef} GLOB 'vp_*'`,
              eq(seatAVerified.verifiedPlayerId, sql`substr(${sparringMatches.seatAPlayerRef}, 4)`),
            ),
          )
          .leftJoin(
            seatBGuest,
            and(
              sql`${sparringMatches.seatBPlayerRef} GLOB 'gp_*'`,
              eq(seatBGuest.guestPlayerId, sql`substr(${sparringMatches.seatBPlayerRef}, 4)`),
            ),
          )
          .leftJoin(
            seatBVerified,
            and(
              sql`${sparringMatches.seatBPlayerRef} GLOB 'vp_*'`,
              eq(seatBVerified.verifiedPlayerId, sql`substr(${sparringMatches.seatBPlayerRef}, 4)`),
            ),
          )

      const beginCreation = Effect.fnUntraced(function* (input: MatchCreationRecord) {
        yield* db
          .insert(sparringMatches)
          .values({
            matchId: input.matchId,
            gameKey: input.gameKey,
            seatAPlayerRef: input.participantRefs.A,
            seatBPlayerRef: input.participantRefs.B,
            status: StoredMatchStatus.creating,
            createdAt: input.createdAt,
          })
          .onConflictDoNothing({ target: sparringMatches.matchId })

        const stored = yield* db
          .select({
            gameKey: sparringMatches.gameKey,
            seatAPlayerRef: sparringMatches.seatAPlayerRef,
            seatBPlayerRef: sparringMatches.seatBPlayerRef,
            status: sparringMatches.status,
            createdAt: sparringMatches.createdAt,
          })
          .from(sparringMatches)
          .where(eq(sparringMatches.matchId, input.matchId))
          .get()

        if (
          !stored ||
          stored.gameKey !== input.gameKey ||
          stored.seatAPlayerRef !== input.participantRefs.A ||
          stored.seatBPlayerRef !== input.participantRefs.B ||
          (stored.status !== StoredMatchStatus.creating && stored.status !== StoredMatchStatus.active) ||
          stored.createdAt !== input.createdAt
        )
          throw new Error('Match row conflicts with room creation')
      }, mapStorageError)

      const activate = Effect.fnUntraced(function* (matchId: MatchId) {
        yield* db
          .update(sparringMatches)
          .set({ status: StoredMatchStatus.active })
          .where(eq(sparringMatches.matchId, matchId))
      }, mapStorageError)

      const findMatch = Effect.fnUntraced(function* (
        matchId: MatchId,
      ): Effect.fn.Return<MatchRecord | null, EffectDrizzleQueryError> {
        const row = yield* db
          .select(matchRowSelection)
          .from(sparringMatches)
          .where(eq(sparringMatches.matchId, matchId))
          .get()

        return row ? matchRecordFromRow(v.parse(MatchRow, row)) : null
      }, mapStorageError)

      const listMatches = Effect.fnUntraced(function* (
        matchIds: readonly MatchId[],
      ): Effect.fn.Return<MatchRecord[], EffectDrizzleQueryError> {
        if (matchIds.length === 0) return []

        const rows = yield* db
          .select(matchRowSelection)
          .from(sparringMatches)
          .where(inArray(sparringMatches.matchId, matchIds))

        return rows.map((row) => matchRecordFromRow(v.parse(MatchRow, row)))
      }, mapStorageError)

      const listLive = Effect.fnUntraced(function* (finishedSince: UnixEpochMilliseconds) {
        const rows = yield* selectJoinedMatchRows()
          .where(
            or(
              eq(sparringMatches.status, StoredMatchStatus.active),
              and(
                eq(sparringMatches.status, StoredMatchStatus.finished),
                gte(sparringMatches.endedAt, finishedSince),
              ),
            ),
          )
          .orderBy(
            sql`CASE WHEN ${sparringMatches.status} = ${StoredMatchStatus.finished} THEN 1 ELSE 0 END`,
            sql`CASE WHEN ${sparringMatches.status} = ${StoredMatchStatus.finished} THEN ${sparringMatches.endedAt} ELSE ${sparringMatches.createdAt} END DESC`,
            sql`${sparringMatches.matchId} DESC`,
          )

        return rows.map((row) => matchListRecordFromRow(row))
      }, mapStorageError)

      const listFinished = Effect.fnUntraced(function* (range: {
        readonly start: UnixEpochMilliseconds
        readonly end: UnixEpochMilliseconds
      }) {
        const rows = yield* selectJoinedMatchRows()
          .where(
            and(
              eq(sparringMatches.status, StoredMatchStatus.finished),
              gte(sparringMatches.createdAt, range.start),
              lt(sparringMatches.createdAt, range.end),
            ),
          )
          .orderBy(sql`${sparringMatches.createdAt} DESC`, sql`${sparringMatches.matchId} DESC`)

        return rows.map((row) => matchListRecordFromRow(row))
      }, mapStorageError)

      /** Find one occupied finished-match day on either side of a UTC day boundary. */
      const findFinishedTime = Effect.fnUntraced(function* (
        input: { readonly before: UnixEpochMilliseconds } | { readonly from: UnixEpochMilliseconds },
      ): Effect.fn.Return<UnixEpochMilliseconds | null, EffectDrizzleQueryError> {
        const older = 'before' in input

        const row = yield* db
          .select({ createdAt: sparringMatches.createdAt })
          .from(sparringMatches)
          .where(
            and(
              eq(sparringMatches.status, StoredMatchStatus.finished),
              older ? lt(sparringMatches.createdAt, input.before) : gte(sparringMatches.createdAt, input.from),
            ),
          )
          .orderBy(older ? desc(sparringMatches.createdAt) : asc(sparringMatches.createdAt))
          .limit(1)
          .get()

        return row?.createdAt ?? null
      }, mapStorageError)

      const findFinishedArchive = Effect.fnUntraced(function* (
        matchId: MatchId,
      ): Effect.fn.Return<FinishedMatchArchiveRecord | null, EffectDrizzleQueryError> {
        const row = yield* db
          .select({
            matchId: sparringMatchArchives.matchId,
            sourceLatestSeq: sparringMatchArchives.sourceLatestSeq,
            stateJson: sparringMatchArchives.stateJson,
            gameResultJson: sparringMatchArchives.gameResultJson,
          })
          .from(sparringMatchArchives)
          .where(eq(sparringMatchArchives.matchId, matchId))
          .get()

        return row ? finishedMatchArchiveRecordFromRow(row) : null
      }, mapStorageError)

      const findProtocolArchive = Effect.fnUntraced(function* (
        matchId: MatchId,
      ): Effect.fn.Return<ProtocolArchiveRecord | null, EffectDrizzleQueryError> {
        const row = yield* selectArchiveRow(matchId)

        return row ? protocolArchiveRecordFromRow(row) : null
      }, mapStorageError)

      const archiveFinished: (
        input: MatchRoomArchiveTransfer,
      ) => Effect.Effect<void, ApplicationStorageError> = Effect.fnUntraced(function* (input) {
        const archive = encodeProtocolArchive(input)

        const storedMatch = yield* db
          .select({
            matchId: sparringMatches.matchId,
            gameKey: sparringMatches.gameKey,
            status: sparringMatches.status,
            createdAt: sparringMatches.createdAt,
            endedAt: sparringMatches.endedAt,
          })
          .from(sparringMatches)
          .where(eq(sparringMatches.matchId, input.matchId))
          .get()

        if (
          !storedMatch ||
          storedMatch.matchId !== input.matchId ||
          storedMatch.gameKey !== input.gameKey ||
          storedMatch.createdAt !== input.createdAt
        )
          throw new MatchFinalizationError('Finished match identity conflicts with D1')

        if (
          storedMatch.status !== StoredMatchStatus.active &&
          storedMatch.status !== StoredMatchStatus.finished
        )
          throw new MatchFinalizationError('Finished match is not ready to archive')

        const inserted = yield* db
          .insert(sparringMatchArchives)
          .values(archive)
          .onConflictDoNothing({ target: sparringMatchArchives.matchId })
          .returning()

        const persistedArchive = inserted[0] ?? (yield* selectArchiveRow(input.matchId))

        if (!persistedArchive || !semanticArchiveEqual(persistedArchive, archive))
          throw new MatchFinalizationError('Finished match archive conflicts with existing data')
      }, mapStorageError)

      const markFinished: (input: MatchRoomArchiveTransfer) => Effect.Effect<void, ApplicationStorageError> =
        Effect.fnUntraced(function* (input) {
          const finalScoreJson = JSON.stringify(projectMatchScore(input.finalState))

          const result = yield* db
            .update(sparringMatches)
            .set({
              status: StoredMatchStatus.finished,
              endedAt: input.endedAt,
              finalSourceLatestSeq: input.sourceLatestSeq,
              finalScoreJson,
            })
            .where(
              and(
                eq(sparringMatches.matchId, input.matchId),
                or(
                  and(
                    eq(sparringMatches.status, StoredMatchStatus.active),
                    isNull(sparringMatches.endedAt),
                    isNull(sparringMatches.finalSourceLatestSeq),
                    isNull(sparringMatches.finalScoreJson),
                  ),
                  and(
                    eq(sparringMatches.status, StoredMatchStatus.finished),
                    eq(sparringMatches.endedAt, input.endedAt),
                    eq(sparringMatches.finalSourceLatestSeq, input.sourceLatestSeq),
                    eq(sparringMatches.finalScoreJson, finalScoreJson),
                  ),
                ),
              ),
            )
            .returning({
              status: sparringMatches.status,
              endedAt: sparringMatches.endedAt,
              finalSourceLatestSeq: sparringMatches.finalSourceLatestSeq,
              finalScoreJson: sparringMatches.finalScoreJson,
            })

          if (
            result.length !== 1 ||
            result[0]?.status !== StoredMatchStatus.finished ||
            result[0].endedAt !== input.endedAt ||
            result[0].finalSourceLatestSeq !== input.sourceLatestSeq ||
            result[0].finalScoreJson !== finalScoreJson
          )
            throw new MatchFinalizationError('Finished match is not ready to mark finished')
        }, mapStorageError)

      return {
        beginCreation,
        activate,
        findMatch,
        listMatches,
        listLive,
        listFinished,
        findFinishedTime,
        findFinishedArchive,
        findProtocolArchive,
        archiveFinished,
        markFinished,
      }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}

const matchRowSelection = {
  matchId: sparringMatches.matchId,
  gameKey: sparringMatches.gameKey,
  status: sparringMatches.status,
  createdAt: sparringMatches.createdAt,
  endedAt: sparringMatches.endedAt,
  seatAPlayerRef: sparringMatches.seatAPlayerRef,
  seatBPlayerRef: sparringMatches.seatBPlayerRef,
  finalSourceLatestSeq: sparringMatches.finalSourceLatestSeq,
  finalScore: sparringMatches.finalScoreJson,
}

const seatAGuest = alias(guestPlayers, 'seat_a_guest')

const seatAVerified = alias(verifiedPlayers, 'seat_a_verified')

const seatBGuest = alias(guestPlayers, 'seat_b_guest')

const seatBVerified = alias(verifiedPlayers, 'seat_b_verified')

const mapStorageError = Effect.mapError(
  (cause: EffectDrizzleQueryError) => new ApplicationStorageError({ cause }),
)
