import { isDeepStrictEqual } from 'node:util'

import {
  MatchCheckpoint,
  MatchConfig,
  MatchRejection,
  MatchScoreProjection,
  ProtocolEntry,
} from '@ks/competition'
import { MatchCommand, MatchId, NonNegativeInteger, PositiveInteger, UnixEpochMilliseconds } from '@ks/core'
import { GameKey } from '@ks/gameplay/definitions'
import { Schema } from 'effect'

import * as schema from './schema'

export const CommandReceipt = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('accepted'), acceptedSeq: PositiveInteger }),
  Schema.Struct({ _tag: Schema.Literal('rejected'), reason: MatchRejection }),
])

export type CommandReceiptLookup =
  | { readonly _tag: 'retry'; readonly receipt: typeof CommandReceipt.Type }
  | { readonly _tag: 'command-id-conflict' }

const ActiveMatchConfig = Schema.Struct({ ...MatchConfig.fields, gameKey: GameKey })

const MatchRecordFields = {
  matchId: MatchId,
  controlSecret: Schema.String.check(Schema.isMinLength(16)),
  config: Schema.fromJsonString(ActiveMatchConfig),
  latestSeq: NonNegativeInteger,
  score: Schema.fromJsonString(MatchScoreProjection),
  createdAt: UnixEpochMilliseconds,
}

export const MatchRecord = Schema.Union([
  Schema.Struct({ ...MatchRecordFields, status: Schema.Literal('active'), endedAt: Schema.Null }).pipe(
    Schema.encodeKeys({ config: 'configJson', score: 'scoreJson' }),
  ),
  Schema.Struct({
    ...MatchRecordFields,
    status: Schema.Literal('finalizing'),
    endedAt: UnixEpochMilliseconds,
  }).pipe(Schema.encodeKeys({ config: 'configJson', score: 'scoreJson' })),
]).check(
  Schema.makeFilter((row) => row.matchId === row.config.matchId),
  Schema.makeFilter((row) => (row.status === 'finalizing') === (row.score.winnerSeat !== null)),
)

export type ActiveMatchRecord = Extract<typeof MatchRecord.Type, { status: 'active' }>

export type FinalizingMatchRecord = Extract<typeof MatchRecord.Type, { status: 'finalizing' }>

export function matchRecordFromRow(row: typeof schema.activeMatches.$inferSelect): typeof MatchRecord.Type {
  try {
    return Schema.decodeUnknownSync(MatchRecord)(row)
  } catch (cause) {
    throw new Error('MatchRoom active_matches storage corruption', { cause })
  }
}

export function commandFromRow(row: typeof schema.commands.$inferSelect): typeof MatchCommand.Type {
  try {
    return Schema.decodeUnknownSync(Schema.fromJsonString(MatchCommand))(row.requestJson)
  } catch (cause) {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`, { cause })
  }
}

export function commandReceiptFromRow(row: typeof schema.commands.$inferSelect): typeof CommandReceipt.Type {
  try {
    if (row.outcome === 'accepted')
      return Schema.decodeUnknownSync(CommandReceipt)({ _tag: 'accepted', acceptedSeq: row.acceptedSeq })
    const rejectionReason: unknown = JSON.parse(row.rejectionJson ?? '')

    return Schema.decodeUnknownSync(CommandReceipt)({ _tag: 'rejected', reason: rejectionReason })
  } catch (cause) {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`, { cause })
  }
}

export function checkpointFromRow(
  row: typeof schema.checkpoints.$inferSelect,
  matchRecord: typeof MatchRecord.Type,
): typeof MatchCheckpoint.Type {
  try {
    const checkpoint = Schema.decodeUnknownSync(Schema.fromJsonString(MatchCheckpoint))(row.aggregateJson)

    if (
      !isDeepStrictEqual(checkpoint.lifecycle.context.config, matchRecord.config) ||
      (checkpoint.lifecycle.value === 'finished') !== (matchRecord.status === 'finalizing')
    )
      throw new Error('config mismatch')

    return checkpoint
  } catch (cause) {
    throw new Error('MatchRoom checkpoint storage corruption', { cause })
  }
}

export function protocolEntryFromRow(
  row: typeof schema.protocolEntries.$inferSelect,
): typeof ProtocolEntry.Type {
  try {
    const entry = Schema.decodeUnknownSync(Schema.fromJsonString(ProtocolEntry))(row.entryJson)

    if (entry.acceptedSeq !== row.acceptedSeq || entry.entryIndex !== row.entryIndex)
      throw new Error('position mismatch')

    return entry
  } catch (cause) {
    throw new Error('MatchRoom Protocol storage corruption', { cause })
  }
}
