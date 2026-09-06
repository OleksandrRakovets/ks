import { type MatchId, MatchState, NonEmptyProtocolEntries, type UnixEpochMilliseconds } from '@ks/core'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import * as v from 'valibot'

import type { MatchRoomCompletionTransfer } from '../match-room-client'
import { PROTOCOL_ARCHIVE_VERSION } from '../protocol'
import { matches, matchProtocolArchives, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

export class CompletedMatchArchiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompletedMatchArchiveError'
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
  const leftRows = v.safeParse(v.pipe(v.string(), v.parseJson(), NonEmptyProtocolEntries), left.rowsJson)
  const rightRows = v.safeParse(v.pipe(v.string(), v.parseJson(), NonEmptyProtocolEntries), right.rowsJson)
  const leftState = v.safeParse(v.pipe(v.string(), v.parseJson(), MatchState), left.stateJson)
  const rightState = v.safeParse(v.pipe(v.string(), v.parseJson(), MatchState), right.stateJson)
  // SAFETY: both schemas validate JSON-compatible structural values.
  const decodedLeftRows = leftRows.success ? (leftRows.output as StructuralValue) : undefined
  // SAFETY: both schemas validate JSON-compatible structural values.
  const decodedRightRows = rightRows.success ? (rightRows.output as StructuralValue) : undefined
  // SAFETY: MatchState validates a JSON-compatible structural value.
  const decodedLeftState = leftState.success ? (leftState.output as StructuralValue) : undefined
  // SAFETY: MatchState validates a JSON-compatible structural value.
  const decodedRightState = rightState.success ? (rightState.output as StructuralValue) : undefined
  return (
    leftRows.success &&
    rightRows.success &&
    leftState.success &&
    rightState.success &&
    structuralEqual(decodedLeftRows, decodedRightRows) &&
    structuralEqual(decodedLeftState, decodedRightState)
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
type StructuralObject = { readonly [key: string]: StructuralValue }

function structuralEqual(left: StructuralValue, right: StructuralValue): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || Object(left) !== left || Object(right) !== right) return false
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structuralEqual(value, right[index]))
    )
  // SAFETY: primitives and arrays were excluded above, leaving structural objects.
  const leftObject = left as StructuralObject
  // SAFETY: primitives and arrays were excluded above, leaving structural objects.
  const rightObject = right as StructuralObject
  const keys = Object.keys(leftObject).filter((key) => leftObject[key] !== undefined)
  const rightKeys = Object.keys(rightObject).filter((key) => rightObject[key] !== undefined)
  return (
    keys.length === rightKeys.length &&
    keys.every((key) => Object.hasOwn(rightObject, key) && structuralEqual(leftObject[key], rightObject[key]))
  )
}

export async function archiveCompletedMatch(
  db: ApplicationDatabase,
  input: MatchRoomCompletionTransfer,
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
    throw new CompletedMatchArchiveError('Completed match identity conflicts with D1')
  if (storedMatch.status !== StoredMatchStatus.active && storedMatch.status !== StoredMatchStatus.finished)
    throw new CompletedMatchArchiveError('Completed match is not ready to archive')
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
    throw new CompletedMatchArchiveError('Completed match archive conflicts with existing data')
}

export async function finishCompletedMatch(
  db: ApplicationDatabase,
  matchId: MatchId,
  endedAt: UnixEpochMilliseconds,
): Promise<void> {
  const result = await db
    .update(matches)
    .set({ status: StoredMatchStatus.finished, endedAt })
    .where(
      and(
        eq(matches.matchId, matchId),
        inArray(matches.status, [StoredMatchStatus.active, StoredMatchStatus.finished]),
        or(isNull(matches.endedAt), eq(matches.endedAt, endedAt)),
      ),
    )
    .returning({ status: matches.status, endedAt: matches.endedAt })
  if (result.length !== 1 || result[0]?.status !== StoredMatchStatus.finished || result[0].endedAt !== endedAt)
    throw new CompletedMatchArchiveError('Completed match is not ready to finish')
}
