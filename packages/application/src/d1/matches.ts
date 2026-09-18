import { MatchId, MatchScoreProjection, NonNegativeInteger, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { RegisteredGameKey } from '@ks/gameplay/definitions'
import { and, eq, gte, inArray, or, sql } from 'drizzle-orm'
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

export async function listMatchRows(
  db: ApplicationDatabase,
  input: { readonly limit: number; readonly offset: number } & (
    | { readonly scope: 'live'; readonly completedSince: UnixEpochMilliseconds }
    | { readonly scope: 'completed' }
  ),
) {
  const where =
    input.scope === 'live'
      ? or(
          eq(matches.status, StoredMatchStatus.active),
          and(eq(matches.status, StoredMatchStatus.finished), gte(matches.endedAt, input.completedSince)),
        )
      : eq(matches.status, StoredMatchStatus.finished)

  const ordering =
    input.scope === 'live'
      ? [
          sql`CASE WHEN ${matches.status} = ${StoredMatchStatus.finished} THEN 1 ELSE 0 END`,
          sql`CASE WHEN ${matches.status} = ${StoredMatchStatus.finished} THEN ${matches.endedAt} ELSE ${matches.createdAt} END DESC`,
          sql`${matches.matchId} DESC`,
        ]
      : [sql`${matches.endedAt} DESC`, sql`${matches.matchId} DESC`]

  const rows = await db
    .select(matchRowSelection)
    .from(matches)
    .where(where)
    .orderBy(...ordering)
    .limit(input.limit)
    .offset(input.offset)

  return rows.map((row) => v.parse(MatchRow, row))
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
