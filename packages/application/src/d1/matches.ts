import { normalizeMatchId } from '@ks/competition'
import { StoredFactSchema, type StoredFact } from '@ks/core'
import { asc, eq, sql } from 'drizzle-orm'
import * as v from 'valibot'

import { facts, matches } from './schema'
import type { ApplicationDatabase } from './types'

export async function listMatchRows(db: ApplicationDatabase) {
  return await db
    .select({
      matchId: matches.matchId,
      gameKey: matches.gameKey,
      status: matches.status,
      createdAt: matches.createdAt,
      seatAPlayerRef: matches.seatAPlayerRef,
      seatBPlayerRef: matches.seatBPlayerRef,
    })
    .from(matches)
    .orderBy(sql`CASE WHEN ${matches.status} = 'finished' THEN 1 ELSE 0 END`, sql`${matches.createdAt} DESC`)
}

export async function getMatchParticipantRefs(
  db: ApplicationDatabase,
  matchId: string,
): Promise<{ A: string; B: string } | null> {
  const row = await db
    .select({ A: matches.seatAPlayerRef, B: matches.seatBPlayerRef })
    .from(matches)
    .where(eq(matches.matchId, normalizeMatchId(matchId)))
    .get()
  return row ?? null
}

export async function getMatchControlSecret(db: ApplicationDatabase, matchId: string): Promise<string | null> {
  const row = await db
    .select({ controlSecret: matches.controlSecret })
    .from(matches)
    .where(eq(matches.matchId, normalizeMatchId(matchId)))
    .get()
  return row?.controlSecret ?? null
}

export async function listStoredFacts(db: ApplicationDatabase, matchId: string): Promise<StoredFact[]> {
  const normalizedMatchId = normalizeMatchId(matchId)
  const rows = await db.select().from(facts).where(eq(facts.matchId, normalizedMatchId)).orderBy(asc(facts.seq))

  return rows.flatMap((row) => {
    const payload = v.safeParse(v.pipe(v.string(), v.parseJson()), row.payloadJson)
    if (!payload.success) return []
    const fact = v.safeParse(StoredFactSchema, {
      seq: row.seq,
      factId: row.factId,
      matchId: row.matchId,
      clientId: row.clientId,
      clientSeq: row.clientSeq,
      at: row.at,
      receivedAt: row.receivedAt,
      type: row.type,
      payload: payload.output,
    })
    return fact.success ? [fact.output] : []
  })
}
