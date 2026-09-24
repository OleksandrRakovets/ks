import { MatchId, MatchScoreProjection, NonNegativeInteger, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import * as v from 'valibot'

import { participantFromPlayerRow } from './players'
import { guestPlayers, sparringMatches, StoredMatchStatus, verifiedPlayers } from './schema'
import type { ApplicationDatabase } from './types'

const MatchRowIdentity = {
  matchId: MatchId,
  gameKey: RegisteredGameKey,
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

/** Match only the ref's player kind; strip its prefix on the match side so each player PK stays indexed. */
function joinedMatchRows(db: ApplicationDatabase) {
  return db
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

function parseJoinedMatchRow(
  row: Awaited<ReturnType<typeof joinedMatchRows>>[number],
  locale: SupportedLocale,
) {
  const match = v.parse(MatchRow, row)

  return {
    ...match,
    participants: {
      A: participantFromPlayerRow(match.seatAPlayerRef, locale, row.seatAGuest ?? row.seatAVerified),
      B: participantFromPlayerRow(match.seatBPlayerRef, locale, row.seatBGuest ?? row.seatBVerified),
    },
  }
}

export async function listLiveMatchRows(
  db: ApplicationDatabase,
  finishedSince: UnixEpochMilliseconds,
  locale: SupportedLocale,
) {
  const rows = await joinedMatchRows(db)
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

  return rows.map((row) => parseJoinedMatchRow(row, locale))
}

export async function listFinishedMatchRows(
  db: ApplicationDatabase,
  range: { readonly start: UnixEpochMilliseconds; readonly end: UnixEpochMilliseconds },
  locale: SupportedLocale,
) {
  const rows = await joinedMatchRows(db)
    .where(
      and(
        eq(sparringMatches.status, StoredMatchStatus.finished),
        gte(sparringMatches.createdAt, range.start),
        lt(sparringMatches.createdAt, range.end),
      ),
    )
    .orderBy(sql`${sparringMatches.createdAt} DESC`, sql`${sparringMatches.matchId} DESC`)

  return rows.map((row) => parseJoinedMatchRow(row, locale))
}

/** Find one occupied finished-match day on either side of a UTC day boundary. */
export async function findFinishedMatchTime(
  db: ApplicationDatabase,
  input: { readonly before: UnixEpochMilliseconds } | { readonly from: UnixEpochMilliseconds },
): Promise<UnixEpochMilliseconds | null> {
  const older = 'before' in input

  const row = await db
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

export async function getMatchRow(db: ApplicationDatabase, matchId: MatchId) {
  const row = await db
    .select(matchRowSelection)
    .from(sparringMatches)
    .where(eq(sparringMatches.matchId, matchId))
    .get()

  return row ? v.parse(MatchRow, row) : null
}

export async function getMatchRows(db: ApplicationDatabase, matchIds: readonly MatchId[]) {
  if (matchIds.length === 0) return []

  const rows = await db
    .select(matchRowSelection)
    .from(sparringMatches)
    .where(inArray(sparringMatches.matchId, matchIds))

  return rows.map((row) => v.parse(MatchRow, row))
}
