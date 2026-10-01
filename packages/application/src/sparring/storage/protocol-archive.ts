import { FinishedMatchState, MatchState, ProtocolEntries } from '@ks/competition'
import { MatchId, PositiveInteger } from '@ks/core'
import { GameResult } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import type { sparringMatchArchives } from '../../d1/schema'
import type { MatchRoomArchiveTransfer } from '../../match/match-room'
import type { FinishedMatchArchiveRecord, ProtocolArchiveRecord } from './records'

export const PROTOCOL_ARCHIVE_VERSION = 1 as const

export class UnsupportedProtocolArchiveVersionError extends Error {
  constructor(matchId: MatchId, version: number) {
    super(`Unsupported protocol archive version ${String(version)} for match ${matchId}`)
    this.name = 'UnsupportedProtocolArchiveVersionError'
  }
}

export class ProtocolArchiveCorruptionError extends Error {
  constructor(matchId: MatchId) {
    super(`Protocol archive storage corruption for match ${matchId}`)
    this.name = 'ProtocolArchiveCorruptionError'
  }
}

export class MatchFinalizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatchFinalizationError'
  }
}

type ArchiveRow = typeof sparringMatchArchives.$inferSelect

type ArchiveInsert = typeof sparringMatchArchives.$inferInsert

type ArchiveStateRow = Pick<ArchiveRow, 'matchId' | 'sourceLatestSeq' | 'stateJson' | 'gameResultJson'>

export function encodeProtocolArchive(input: MatchRoomArchiveTransfer): ArchiveInsert {
  return {
    matchId: input.matchId,
    sourceLatestSeq: input.sourceLatestSeq,
    protocolVersion: PROTOCOL_ARCHIVE_VERSION,
    rowsJson: JSON.stringify(input.protocolEntries),
    stateJson: JSON.stringify(input.finalState),
    gameResultJson: input.gameResult === null ? null : JSON.stringify(input.gameResult),
    createdAt: input.endedAt,
  }
}

export function finishedMatchArchiveRecordFromRow(row: ArchiveStateRow): FinishedMatchArchiveRecord {
  try {
    const { matchId: _matchId, ...archive } = v.parse(ArchiveStateStorageRow, row)

    return archive
  } catch {
    throw new ProtocolArchiveCorruptionError(row.matchId)
  }
}

export function protocolArchiveRecordFromRow(row: ArchiveRow): ProtocolArchiveRecord {
  try {
    const { matchId: _matchId, ...archive } = v.parse(ArchiveStateStorageRow, row)
    const protocolVersion = v.parse(v.literal(PROTOCOL_ARCHIVE_VERSION), row.protocolVersion)
    const entries = v.parse(v.pipe(v.string(), v.parseJson(), ProtocolEntries), row.rowsJson)
    const gameKey = archive.state.gameKey

    if (entries.some((entry) => entry.gameKey !== gameKey))
      throw new Error('Protocol archive game key mismatch')

    return { ...archive, protocolVersion, entries }
  } catch {
    if (row.protocolVersion !== PROTOCOL_ARCHIVE_VERSION)
      throw new UnsupportedProtocolArchiveVersionError(row.matchId, row.protocolVersion)
    throw new ProtocolArchiveCorruptionError(row.matchId)
  }
}

export function semanticArchiveEqual(left: ArchiveRow, right: ArchiveInsert): boolean {
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

const ArchiveStateStorageRow = v.pipe(
  v.object({
    matchId: MatchId,
    sourceLatestSeq: PositiveInteger,
    stateJson: v.pipe(v.string(), v.parseJson(), FinishedMatchState),
    gameResultJson: v.nullable(v.pipe(v.string(), v.parseJson(), GameResult)),
  }),
  v.transform(({ stateJson, gameResultJson, ...row }) => ({
    ...row,
    state: stateJson,
    gameResult: gameResultJson,
  })),
  v.check((value) => value.state.matchId === value.matchId, 'Archive match ID does not match state'),
  v.check(
    (value) =>
      value.state.gameKey === 'free-pyramid-long'
        ? value.gameResult?.gameKey === value.state.gameKey
        : value.gameResult === null,
    'Archive game result does not match game',
  ),
)

type StructuralValue =
  | undefined
  | null
  | boolean
  | number
  | string
  | readonly StructuralValue[]
  | StructuralObject
  | MatchState
  | ProtocolEntries
  | GameResult

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
