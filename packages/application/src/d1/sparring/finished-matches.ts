import {
  MatchState,
  type MatchState as MatchStateValue,
  projectMatchScore,
  ProtocolEntries,
  type ProtocolEntries as ProtocolEntriesValue,
} from '@ks/competition'
import { GameResult, type GameResult as GameResultValue } from '@ks/gameplay/definitions'
import { and, eq, isNull, or } from 'drizzle-orm'
import * as v from 'valibot'

import type { MatchRoomArchiveTransfer } from '../../match-room-client'
import { PROTOCOL_ARCHIVE_VERSION } from '../../protocol'
import { sparringMatchArchives, sparringMatches, StoredMatchStatus } from '../schema'
import type { ApplicationDatabase } from '../types'

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
    gameResultJson: string | null
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
  const resultSchema = v.nullable(v.pipe(v.string(), v.parseJson(), GameResult))
  const leftResult = v.safeParse(resultSchema, left.gameResultJson)
  const rightResult = v.safeParse(resultSchema, right.gameResultJson)

  return (
    leftRows.success &&
    rightRows.success &&
    leftState.success &&
    rightState.success &&
    leftResult.success &&
    rightResult.success &&
    structuralEqual(leftRows.output, rightRows.output) &&
    structuralEqual(leftState.output, rightState.output) &&
    structuralEqual(leftResult.output, rightResult.output)
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
  | GameResultValue

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
    gameResultJson: input.gameResult === null ? null : JSON.stringify(input.gameResult),
    createdAt: input.endedAt,
  }

  const storedMatch = await db
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

  const inserted = await db
    .insert(sparringMatchArchives)
    .values(archive)
    .onConflictDoNothing({ target: sparringMatchArchives.matchId })
    .returning()

  const persistedArchive =
    inserted[0] ??
    (await db
      .select()
      .from(sparringMatchArchives)
      .where(eq(sparringMatchArchives.matchId, input.matchId))
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
