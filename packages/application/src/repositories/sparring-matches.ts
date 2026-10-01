import { MatchScoreProjection, projectMatchScore } from '@ks/competition'
import { MatchId, NonNegativeInteger, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { GameKey } from '@ks/gameplay/definitions'
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import * as v from 'valibot'

import type { ApplicationDatabase } from '../../d1/database'
import {
  guestPlayers,
  sparringMatchArchives,
  sparringMatches,
  StoredMatchStatus,
  verifiedPlayers,
} from '../../d1/schema'
import type { MatchRoomArchiveTransfer } from '../match-room-client'
import type {
  FinishedMatchArchiveRecord,
  MatchCreationRecord,
  MatchListRecord,
  MatchRecord,
  ProtocolArchiveRecord,
} from '../records'
import { participantRecordFromRow } from './players'
import {
  decodeFinishedArchive,
  decodeProtocolArchive,
  encodeProtocolArchive,
  MatchFinalizationError,
  semanticArchiveEqual,
} from './protocol-archive'

export class SparringMatchRepository {
  readonly #db: ApplicationDatabase

  constructor(db: ApplicationDatabase) {
    this.#db = db
  }

  async beginCreation(input: MatchCreationRecord): Promise<void> {
    await this.#db
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

    const stored = await this.#db
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
  }

  async activate(matchId: MatchId): Promise<void> {
    await this.#db
      .update(sparringMatches)
      .set({ status: StoredMatchStatus.active })
      .where(eq(sparringMatches.matchId, matchId))
  }

  async readMatch(matchId: MatchId): Promise<MatchRecord | null> {
    const row = await this.#db
      .select(matchRowSelection)
      .from(sparringMatches)
      .where(eq(sparringMatches.matchId, matchId))
      .get()

    return row ? matchRecordFromRow(v.parse(MatchRow, row)) : null
  }

  async readMatches(matchIds: readonly MatchId[]): Promise<MatchRecord[]> {
    if (matchIds.length === 0) return []

    const rows = await this.#db
      .select(matchRowSelection)
      .from(sparringMatches)
      .where(inArray(sparringMatches.matchId, matchIds))

    return rows.map((row) => matchRecordFromRow(v.parse(MatchRow, row)))
  }

  async listLive(finishedSince: UnixEpochMilliseconds): Promise<MatchListRecord[]> {
    const rows = await this.#joinedMatchQuery()
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

    return rows.map((row) => parseJoinedMatchRow(row))
  }

  async listFinished(range: {
    readonly start: UnixEpochMilliseconds
    readonly end: UnixEpochMilliseconds
  }): Promise<MatchListRecord[]> {
    const rows = await this.#joinedMatchQuery()
      .where(
        and(
          eq(sparringMatches.status, StoredMatchStatus.finished),
          gte(sparringMatches.createdAt, range.start),
          lt(sparringMatches.createdAt, range.end),
        ),
      )
      .orderBy(sql`${sparringMatches.createdAt} DESC`, sql`${sparringMatches.matchId} DESC`)

    return rows.map((row) => parseJoinedMatchRow(row))
  }

  /** Find one occupied finished-match day on either side of a UTC day boundary. */
  async findFinishedTime(
    input: { readonly before: UnixEpochMilliseconds } | { readonly from: UnixEpochMilliseconds },
  ): Promise<UnixEpochMilliseconds | null> {
    const older = 'before' in input

    const row = await this.#db
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
  }

  async readFinishedArchive(matchId: MatchId): Promise<FinishedMatchArchiveRecord | null> {
    const row = await this.#db
      .select({
        matchId: sparringMatchArchives.matchId,
        sourceLatestSeq: sparringMatchArchives.sourceLatestSeq,
        stateJson: sparringMatchArchives.stateJson,
        gameResultJson: sparringMatchArchives.gameResultJson,
      })
      .from(sparringMatchArchives)
      .where(eq(sparringMatchArchives.matchId, matchId))
      .get()

    return row ? decodeFinishedArchive(row) : null
  }

  async readProtocolArchive(matchId: MatchId): Promise<ProtocolArchiveRecord | null> {
    const row = await this.#selectArchive(matchId)

    return row ? decodeProtocolArchive(row) : null
  }

  async archiveFinished(input: MatchRoomArchiveTransfer): Promise<void> {
    const archive = encodeProtocolArchive(input)

    const storedMatch = await this.#db
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

    if (storedMatch.status !== StoredMatchStatus.active && storedMatch.status !== StoredMatchStatus.finished)
      throw new MatchFinalizationError('Finished match is not ready to archive')

    const inserted = await this.#db
      .insert(sparringMatchArchives)
      .values(archive)
      .onConflictDoNothing({ target: sparringMatchArchives.matchId })
      .returning()

    const persistedArchive = inserted[0] ?? (await this.#selectArchive(input.matchId))

    if (!persistedArchive || !semanticArchiveEqual(persistedArchive, archive))
      throw new MatchFinalizationError('Finished match archive conflicts with existing data')
  }

  async markFinished(input: MatchRoomArchiveTransfer): Promise<void> {
    const finalScoreJson = JSON.stringify(projectMatchScore(input.finalState))

    const result = await this.#db
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
  }

  #selectArchive(matchId: MatchId): Promise<typeof sparringMatchArchives.$inferSelect | undefined> {
    return this.#db
      .select()
      .from(sparringMatchArchives)
      .where(eq(sparringMatchArchives.matchId, matchId))
      .get()
  }

  /** Match only the ref's player kind; strip its prefix on the match side so each player PK stays indexed. */
  #joinedMatchQuery() {
    return this.#db
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
  }
}

const MatchRowIdentity = {
  matchId: MatchId,
  gameKey: GameKey,
  createdAt: UnixEpochMilliseconds,
  seatAPlayerRef: PlayerRef,
  seatBPlayerRef: PlayerRef,
}

const MatchRow = v.pipe(
  v.variant('status', [
    v.object({
      ...MatchRowIdentity,
      status: v.literal(StoredMatchStatus.creating),
      endedAt: v.nullable(UnixEpochMilliseconds),
      finalSourceLatestSeq: v.null(),
      finalScore: v.null(),
    }),
    v.object({
      ...MatchRowIdentity,
      status: v.literal(StoredMatchStatus.active),
      endedAt: v.nullable(UnixEpochMilliseconds),
      finalSourceLatestSeq: v.null(),
      finalScore: v.null(),
    }),
    v.pipe(
      v.object({
        ...MatchRowIdentity,
        status: v.literal(StoredMatchStatus.finished),
        endedAt: UnixEpochMilliseconds,
        finalSourceLatestSeq: NonNegativeInteger,
        finalScore: v.pipe(v.string(), v.parseJson(), MatchScoreProjection),
      }),
      v.check((row) => row.finalScore.activeFrame === null, 'Finished Match row has an active Frame'),
      v.check((row) => row.finalScore.winnerSeat !== null, 'Finished Match row has no winner'),
    ),
  ]),
  v.readonly(),
)

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

function parseJoinedMatchRow(
  row: Omit<typeof sparringMatches.$inferSelect, 'finalScoreJson'> & {
    finalScore: string | null
    seatAGuest: typeof guestPlayers.$inferSelect | null
    seatAVerified: typeof verifiedPlayers.$inferSelect | null
    seatBGuest: typeof guestPlayers.$inferSelect | null
    seatBVerified: typeof verifiedPlayers.$inferSelect | null
  },
): MatchListRecord {
  const match = v.parse(MatchRow, row)

  return {
    ...matchRecordFromRow(match),
    participants: {
      A: participantRecordFromRow(match.seatAPlayerRef, row.seatAGuest ?? row.seatAVerified),
      B: participantRecordFromRow(match.seatBPlayerRef, row.seatBGuest ?? row.seatBVerified),
    },
  }
}

function matchRecordFromRow(row: v.InferOutput<typeof MatchRow>): MatchRecord {
  const identity = {
    matchId: row.matchId,
    gameKey: row.gameKey,
    createdAt: row.createdAt,
    participantRefs: { A: row.seatAPlayerRef, B: row.seatBPlayerRef },
  }

  return row.status === 'finished'
    ? {
        ...identity,
        status: row.status,
        endedAt: row.endedAt,
        finalSourceLatestSeq: row.finalSourceLatestSeq,
        finalScore: row.finalScore,
      }
    : { ...identity, status: row.status }
}
