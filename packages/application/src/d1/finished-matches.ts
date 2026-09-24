import {
  MatchState,
  type MatchState as MatchStateValue,
  projectMatchScore,
  ProtocolEntries,
  type ProtocolEntries as ProtocolEntriesValue,
} from '@ks/core'
import { and, eq, isNull, or } from 'drizzle-orm'
import * as v from 'valibot'

import type { MatchRoomArchiveTransfer } from '../match-room-client'
import { PROTOCOL_ARCHIVE_VERSION } from '../protocol'
import { matches, matchProtocolArchives, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

export class MatchFinalizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatchFinalizationError'
  }
}

function semanticArchiveEqual(
  left: {
    sourceLatestSeq: number
    protocolVersion: number
    rowsJson: string
    stateJson: string
    createdAt: number
  },
  right: typeof left,
): boolean {
  if (
    left.sourceLatestSeq !== right.sourceLatestSeq ||
    left.protocolVersion !== right.protocolVersion ||
    left.createdAt !== right.createdAt
  )
    return false
  const leftRows = v.safeParse(v.pipe(v.string(), v.parseJson(), ProtocolEntries), left.rowsJson)
  const rightRows = v.safeParse(v.pipe(v.string(), v.parseJson(), ProtocolEntries), right.rowsJson)
  const leftState = v.safeParse(v.pipe(v.string(), v.parseJson(), MatchState), left.stateJson)
  const rightState = v.safeParse(v.pipe(v.string(), v.parseJson(), MatchState), right.stateJson)

  return (
    leftRows.success &&
    rightRows.success &&
    leftState.success &&
    rightState.success &&
    structuralEqual(leftRows.output, rightRows.output) &&
    structuralEqual(leftState.output, rightState.output)
  )
}

type StructuralValue =
  | undefined
  | null
  | boolean
  | number
  | string
  | readonly StructuralValue[]
  | StructuralObject
  | MatchStateValue
  | ProtocolEntriesValue

type StructuralObject = { readonly [key: string]: StructuralValue }

function structuralEqual(left: StructuralValue, right: StructuralValue): boolean {
  if (Object.is(left, right)) return true

  if (isStructuralArray(left) || isStructuralArray(right))
    return (
      isStructuralArray(left) &&
      isStructuralArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structuralEqual(value, right[index]))
    )

  if (!isStructuralObject(left) || !isStructuralObject(right)) return false
  const entries = Object.entries(left).filter(([, value]) => value !== undefined)
  const rightValues = new Map(Object.entries(right).filter(([, value]) => value !== undefined))

  return (
    entries.length === rightValues.size &&
    entries.every(([key, value]) => rightValues.has(key) && structuralEqual(value, rightValues.get(key)))
  )
}

function isStructuralArray(value: StructuralValue): value is readonly StructuralValue[] {
  return Array.isArray(value)
}

function isStructuralObject(value: StructuralValue): value is StructuralObject {
  return value !== null && !isStructuralArray(value) && Object(value) === value
}

export async function archiveFinishedMatch(
  db: ApplicationDatabase,
  input: MatchRoomArchiveTransfer,
): Promise<void> {
  const archive = {
    matchId: input.matchId,
    sourceLatestSeq: input.sourceLatestSeq,
    protocolVersion: PROTOCOL_ARCHIVE_VERSION,
    rowsJson: JSON.stringify(input.protocolEntries),
    stateJson: JSON.stringify(input.finalState),
    createdAt: input.endedAt,
  }

  const storedMatch = await db
    .select({
      matchId: matches.matchId,
      gameKey: matches.gameKey,
      status: matches.status,
      createdAt: matches.createdAt,
      endedAt: matches.endedAt,
    })
    .from(matches)
    .where(eq(matches.matchId, input.matchId))
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

  const inserted = await db
    .insert(matchProtocolArchives)
    .values(archive)
    .onConflictDoNothing({ target: matchProtocolArchives.matchId })
    .returning()

  const persistedArchive =
    inserted[0] ??
    (await db
      .select()
      .from(matchProtocolArchives)
      .where(eq(matchProtocolArchives.matchId, input.matchId))
      .get())

  if (!persistedArchive || !semanticArchiveEqual(persistedArchive, archive))
    throw new MatchFinalizationError('Finished match archive conflicts with existing data')
}

export async function markMatchFinished(
  db: ApplicationDatabase,
  input: MatchRoomArchiveTransfer,
): Promise<void> {
  const finalScoreJson = JSON.stringify(projectMatchScore(input.finalState))

  const result = await db
    .update(matches)
    .set({
      status: StoredMatchStatus.finished,
      endedAt: input.endedAt,
      finalSourceLatestSeq: input.sourceLatestSeq,
      finalScoreJson,
    })
    .where(
      and(
        eq(matches.matchId, input.matchId),
        or(
          and(
            eq(matches.status, StoredMatchStatus.active),
            isNull(matches.endedAt),
            isNull(matches.finalSourceLatestSeq),
            isNull(matches.finalScoreJson),
          ),
          and(
            eq(matches.status, StoredMatchStatus.finished),
            eq(matches.endedAt, input.endedAt),
            eq(matches.finalSourceLatestSeq, input.sourceLatestSeq),
            eq(matches.finalScoreJson, finalScoreJson),
          ),
        ),
      ),
    )
    .returning({
      status: matches.status,
      endedAt: matches.endedAt,
      finalSourceLatestSeq: matches.finalSourceLatestSeq,
      finalScoreJson: matches.finalScoreJson,
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
