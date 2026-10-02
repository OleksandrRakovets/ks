import { FinishedMatchState, MatchState, ProtocolEntries } from '@ks/competition'
import { MatchId, PositiveInteger } from '@ks/core'
import { GameResult } from '@ks/gameplay/definitions'
import { Result, Schema } from 'effect'

import type { sparringMatchArchives } from '../../d1/schema'
import type { MatchRoomArchiveTransfer } from '../../match/match-room'
import type { FinishedMatchArchiveRecord, ProtocolArchiveRecord } from './records'

const PROTOCOL_ARCHIVE_VERSION = 1 as const

export class UnsupportedProtocolArchiveVersionError extends Error {
  constructor(matchId: typeof MatchId.Type, version: number) {
    super(`Unsupported protocol archive version ${String(version)} for match ${matchId}`)
    this.name = 'UnsupportedProtocolArchiveVersionError'
  }
}

export class ProtocolArchiveCorruptionError extends Error {
  constructor(matchId: typeof MatchId.Type) {
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
    const { matchId: _matchId, ...archive } = Schema.decodeUnknownSync(ArchiveStateStorageRow)(row)

    return archive
  } catch {
    throw new ProtocolArchiveCorruptionError(row.matchId)
  }
}

export function protocolArchiveRecordFromRow(row: ArchiveRow): ProtocolArchiveRecord {
  try {
    const { matchId: _matchId, ...archive } = Schema.decodeUnknownSync(ArchiveStateStorageRow)(row)

    const protocolVersion = Schema.decodeUnknownSync(Schema.Literal(PROTOCOL_ARCHIVE_VERSION))(
      row.protocolVersion,
    )

    const entries = Schema.decodeUnknownSync(Schema.fromJsonString(ProtocolEntries))(row.rowsJson)
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
  const leftRows = Schema.decodeUnknownResult(Schema.fromJsonString(ProtocolEntries))(left.rowsJson)
  const rightRows = Schema.decodeUnknownResult(Schema.fromJsonString(ProtocolEntries))(right.rowsJson)
  const leftState = Schema.decodeUnknownResult(Schema.fromJsonString(MatchState))(left.stateJson)
  const rightState = Schema.decodeUnknownResult(Schema.fromJsonString(MatchState))(right.stateJson)
  const resultSchema = Schema.NullOr(Schema.fromJsonString(GameResult))
  const leftResult = Schema.decodeUnknownResult(resultSchema)(left.gameResultJson)
  const rightResult = Schema.decodeUnknownResult(resultSchema)(right.gameResultJson)

  return (
    Result.isSuccess(leftRows) &&
    Result.isSuccess(rightRows) &&
    Result.isSuccess(leftState) &&
    Result.isSuccess(rightState) &&
    Result.isSuccess(leftResult) &&
    Result.isSuccess(rightResult) &&
    structuralEqual(leftRows.success, rightRows.success) &&
    structuralEqual(leftState.success, rightState.success) &&
    structuralEqual(leftResult.success, rightResult.success)
  )
}

const ArchiveStateStorageRow = Schema.Struct({
  matchId: MatchId,
  sourceLatestSeq: PositiveInteger,
  state: Schema.fromJsonString(FinishedMatchState),
  gameResult: Schema.NullOr(Schema.fromJsonString(GameResult)),
})
  .pipe(Schema.encodeKeys({ state: 'stateJson', gameResult: 'gameResultJson' }))
  .check(
    Schema.makeFilter((value) => value.state.matchId === value.matchId, {
      expected: 'Archive match ID does not match state',
    }),
    Schema.makeFilter(
      (value) =>
        value.state.gameKey === 'free-pyramid-long'
          ? value.gameResult?.gameKey === value.state.gameKey
          : value.gameResult === null,
      { expected: 'Archive game result does not match game' },
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
  | typeof MatchState.Type
  | typeof ProtocolEntries.Type
  | typeof GameResult.Type

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
