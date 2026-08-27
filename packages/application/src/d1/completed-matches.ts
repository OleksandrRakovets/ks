import { type MatchId, type MatchState, MatchStateSchema, NonEmptyProtocolEntries } from '@ks/core'
import { and, eq, inArray } from 'drizzle-orm'
import * as v from 'valibot'

import type { MatchRoomFinalizationData } from '../match-room-client'
import { PROTOCOL_ARCHIVE_VERSION } from '../protocol'
import { matches, matchProtocolArchives, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

export type CompletedMatchArchiveInput = MatchRoomFinalizationData

export class CompletedMatchArchiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompletedMatchArchiveError'
  }
}

function validateCompletedMatchTransfer(input: CompletedMatchArchiveInput): MatchState {
  const entries = [...input.protocolEntries].sort(
    (a, b) => a.acceptedSeq - b.acceptedSeq || a.entryIndex - b.entryIndex,
  )
  let sequence = 1
  let index = 0
  let commandId = ''
  let acceptedAt = 0
  for (const entry of entries) {
    if (entry.acceptedSeq !== sequence) {
      if (entry.acceptedSeq !== sequence + 1)
        throw new CompletedMatchArchiveError('Protocol sequence is not contiguous')
      sequence += 1
      index = 0
      commandId = ''
      acceptedAt = 0
    }
    if (entry.entryIndex !== index++)
      throw new CompletedMatchArchiveError('Protocol entry index is not contiguous')
    if (commandId && (entry.causedByCommandId !== commandId || entry.acceptedAt !== acceptedAt))
      throw new CompletedMatchArchiveError('Protocol command ownership is inconsistent')
    commandId ||= entry.causedByCommandId
    acceptedAt ||= entry.acceptedAt
  }
  const terminal = entries.filter((entry) => entry.entryType === 'match-ended')
  const tail = entries.at(-1)
  const frames = input.finalState.frames
  const wins = {
    A: frames.filter((frame) => frame.winnerSeat === 'A').length,
    B: frames.filter((frame) => frame.winnerSeat === 'B').length,
  }
  const winner =
    wins.A === input.finalState.targets.matchTargetFrames
      ? 'A'
      : wins.B === input.finalState.targets.matchTargetFrames
        ? 'B'
        : null
  if (
    input.matchId !== input.finalState.matchId ||
    input.gameKey !== input.finalState.gameKey ||
    input.endedAt < input.createdAt ||
    sequence !== input.sourceLatestSeq ||
    input.finalState.currentFrameIndex !== frames.at(-1)?.frameIndex ||
    frames.some((frame, frameIndex) => frame.frameIndex !== frameIndex + 1) ||
    wins.A !== input.finalState.framesWonBySeat.A ||
    wins.B !== input.finalState.framesWonBySeat.B ||
    !winner ||
    terminal.length !== 1 ||
    tail !== terminal[0] ||
    !tail ||
    tail.acceptedSeq !== input.sourceLatestSeq ||
    tail.acceptedAt !== input.endedAt ||
    tail.seat !== winner
  )
    throw new CompletedMatchArchiveError('Completed match transfer is inconsistent')
  return input.finalState
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
  const leftState = v.safeParse(v.pipe(v.string(), v.parseJson(), MatchStateSchema), left.stateJson)
  const rightState = v.safeParse(v.pipe(v.string(), v.parseJson(), MatchStateSchema), right.stateJson)
  // SAFETY: both schemas validate JSON-compatible structural values.
  const decodedLeftRows = leftRows.success ? (leftRows.output as StructuralValue) : undefined
  // SAFETY: both schemas validate JSON-compatible structural values.
  const decodedRightRows = rightRows.success ? (rightRows.output as StructuralValue) : undefined
  // SAFETY: MatchStateSchema validates a JSON-compatible structural value.
  const decodedLeftState = leftState.success ? (leftState.output as StructuralValue) : undefined
  // SAFETY: MatchStateSchema validates a JSON-compatible structural value.
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
  input: CompletedMatchArchiveInput,
): Promise<void> {
  const state = validateCompletedMatchTransfer(input)
  const archive = {
    matchId: input.matchId,
    sourceLatestSeq: input.sourceLatestSeq,
    protocolVersion: PROTOCOL_ARCHIVE_VERSION,
    rowsJson: JSON.stringify(
      [...input.protocolEntries].sort(
        (left, right) => left.acceptedSeq - right.acceptedSeq || left.entryIndex - right.entryIndex,
      ),
    ),
    stateJson: JSON.stringify(state),
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
  if (
    storedMatch.status !== StoredMatchStatus.active &&
    storedMatch.status !== StoredMatchStatus.finalizing &&
    storedMatch.status !== StoredMatchStatus.finished
  )
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

  const updated = await db
    .update(matches)
    .set({ status: StoredMatchStatus.finalizing, endedAt: input.endedAt })
    .where(
      and(
        eq(matches.matchId, input.matchId),
        inArray(matches.status, [StoredMatchStatus.active, StoredMatchStatus.finalizing]),
      ),
    )
    .returning({ status: matches.status, endedAt: matches.endedAt })
  const persistedMatch =
    updated[0] ??
    (await db
      .select({ status: matches.status, endedAt: matches.endedAt })
      .from(matches)
      .where(eq(matches.matchId, input.matchId))
      .get())
  if (
    (persistedMatch?.status !== StoredMatchStatus.finalizing &&
      persistedMatch?.status !== StoredMatchStatus.finished) ||
    persistedMatch.endedAt !== input.endedAt
  )
    throw new CompletedMatchArchiveError('Completed match lifecycle conflicts with existing data')
}

export async function finishCompletedMatch(db: ApplicationDatabase, matchId: MatchId): Promise<void> {
  const result = await db
    .update(matches)
    .set({ status: StoredMatchStatus.finished })
    .where(
      and(
        eq(matches.matchId, matchId),
        inArray(matches.status, [StoredMatchStatus.finalizing, StoredMatchStatus.finished]),
      ),
    )
    .returning({ status: matches.status })
  if (result.length !== 1 || result[0]?.status !== StoredMatchStatus.finished)
    throw new CompletedMatchArchiveError('Completed match is not ready to finish')
}
