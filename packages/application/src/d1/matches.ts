import { MatchId, MatchScoreProjection, NonNegativeInteger, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import * as v from 'valibot'

import { participantFromPlayerRow } from './players'
import { guestPlayers, matches, StoredMatchStatus, verifiedPlayers } from './schema'
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
  matchId: matches.matchId,
  gameKey: matches.gameKey,
  status: matches.status,
  createdAt: matches.createdAt,
  endedAt: matches.endedAt,
  seatAPlayerRef: matches.seatAPlayerRef,
  seatBPlayerRef: matches.seatBPlayerRef,
  finalSourceLatestSeq: matches.finalSourceLatestSeq,
  finalScore: matches.finalScoreJson,
}

const seatAGuest = alias(guestPlayers, 'seat_a_guest')

const seatAVerified = alias(verifiedPlayers, 'seat_a_verified')

const seatBGuest = alias(guestPlayers, 'seat_b_guest')

const seatBVerified = alias(verifiedPlayers, 'seat_b_verified')

/** Match only the ref's player kind; strip its prefix on the match side so each player PK stays indexed. */
function joinedMatchRows(db: ApplicationDatabase) {
  return db
    .select({ ...matchRowSelection, seatAGuest, seatAVerified, seatBGuest, seatBVerified })
    .from(matches)
    .leftJoin(
      seatAGuest,
      and(
        sql`${matches.seatAPlayerRef} GLOB 'gp_*'`,
        eq(seatAGuest.guestPlayerId, sql`substr(${matches.seatAPlayerRef}, 4)`),
      ),
    )
    .leftJoin(
      seatAVerified,
      and(
        sql`${matches.seatAPlayerRef} GLOB 'vp_*'`,
        eq(seatAVerified.verifiedPlayerId, sql`substr(${matches.seatAPlayerRef}, 4)`),
      ),
    )
    .leftJoin(
      seatBGuest,
      and(
        sql`${matches.seatBPlayerRef} GLOB 'gp_*'`,
        eq(seatBGuest.guestPlayerId, sql`substr(${matches.seatBPlayerRef}, 4)`),
      ),
    )
    .leftJoin(
      seatBVerified,
      and(
        sql`${matches.seatBPlayerRef} GLOB 'vp_*'`,
        eq(seatBVerified.verifiedPlayerId, sql`substr(${matches.seatBPlayerRef}, 4)`),
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
        eq(matches.status, StoredMatchStatus.active),
        and(eq(matches.status, StoredMatchStatus.finished), gte(matches.endedAt, finishedSince)),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${matches.status} = ${StoredMatchStatus.finished} THEN 1 ELSE 0 END`,
      sql`CASE WHEN ${matches.status} = ${StoredMatchStatus.finished} THEN ${matches.endedAt} ELSE ${matches.createdAt} END DESC`,
      sql`${matches.matchId} DESC`,
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
        eq(matches.status, StoredMatchStatus.finished),
        gte(matches.createdAt, range.start),
        lt(matches.createdAt, range.end),
      ),
    )
    .orderBy(sql`${matches.createdAt} DESC`, sql`${matches.matchId} DESC`)

  return rows.map((row) => parseJoinedMatchRow(row, locale))
}

/** Find one occupied finished-match day on either side of a UTC day boundary. */
export async function findFinishedMatchTime(
  db: ApplicationDatabase,
  input: { readonly before: UnixEpochMilliseconds } | { readonly from: UnixEpochMilliseconds },
): Promise<UnixEpochMilliseconds | null> {
  const older = 'before' in input

  const row = await db
    .select({ createdAt: matches.createdAt })
    .from(matches)
    .where(
      and(
        eq(matches.status, StoredMatchStatus.finished),
        older ? lt(matches.createdAt, input.before) : gte(matches.createdAt, input.from),
      ),
    )
    .orderBy(older ? desc(matches.createdAt) : asc(matches.createdAt))
    .limit(1)
    .get()

  return row?.createdAt ?? null
}

export async function getMatchRow(db: ApplicationDatabase, matchId: MatchId) {
  const row = await db.select(matchRowSelection).from(matches).where(eq(matches.matchId, matchId)).get()

  return row ? v.parse(MatchRow, row) : null
}

export async function getMatchRows(db: ApplicationDatabase, matchIds: readonly MatchId[]) {
  if (matchIds.length === 0) return []
  const rows = await db.select(matchRowSelection).from(matches).where(inArray(matches.matchId, matchIds))

  return rows.map((row) => v.parse(MatchRow, row))
}
