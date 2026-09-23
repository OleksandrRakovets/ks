import { MatchId, MatchScoreProjection, NonNegativeInteger, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { RegisteredGameKey } from '@ks/gameplay/definitions'
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import * as v from 'valibot'

import { matches, StoredMatchStatus } from './schema'
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

export async function listLiveMatchRows(db: ApplicationDatabase, completedSince: UnixEpochMilliseconds) {
  const rows = await db
    .select(matchRowSelection)
    .from(matches)
    .where(
      or(
        eq(matches.status, StoredMatchStatus.active),
        and(eq(matches.status, StoredMatchStatus.finished), gte(matches.endedAt, completedSince)),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${matches.status} = ${StoredMatchStatus.finished} THEN 1 ELSE 0 END`,
      sql`CASE WHEN ${matches.status} = ${StoredMatchStatus.finished} THEN ${matches.endedAt} ELSE ${matches.createdAt} END DESC`,
      sql`${matches.matchId} DESC`,
    )

  return rows.map((row) => v.parse(MatchRow, row))
}

export async function listCompletedMatchRows(
  db: ApplicationDatabase,
  range: { readonly start: UnixEpochMilliseconds; readonly end: UnixEpochMilliseconds },
) {
  const rows = await db
    .select(matchRowSelection)
    .from(matches)
    .where(
      and(
        eq(matches.status, StoredMatchStatus.finished),
        gte(matches.createdAt, range.start),
        lt(matches.createdAt, range.end),
      ),
    )
    .orderBy(sql`${matches.createdAt} DESC`, sql`${matches.matchId} DESC`)

  return rows.map((row) => v.parse(MatchRow, row))
}

/** Find one occupied completed-match day on either side of a UTC day boundary. */
export async function findCompletedMatchTime(
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
