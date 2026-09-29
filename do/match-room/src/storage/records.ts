import { isDeepStrictEqual } from 'node:util'

import {
  MatchCheckpoint,
  MatchRejection,
  parseProtocolEntry,
  type RegisteredProtocolEntry,
} from '@ks/competition'
import {
  MatchCommand,
  MatchConfig,
  MatchId,
  MatchScoreProjection,
  NonNegativeInteger,
  PositiveInteger,
  ProtocolEntry,
  UnixEpochMilliseconds,
} from '@ks/core'
import { RegisteredGameKey } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import * as schema from './schema'

const CommandReceipt = v.variant('_tag', [
  v.pipe(v.object({ _tag: v.literal('accepted'), acceptedSeq: PositiveInteger }), v.readonly()),
  v.pipe(v.object({ _tag: v.literal('rejected'), reason: MatchRejection }), v.readonly()),
])

export type CommandReceipt = v.InferOutput<typeof CommandReceipt>

export type CommandReceiptLookup =
  | { readonly _tag: 'retry'; readonly receipt: CommandReceipt }
  | { readonly _tag: 'command-id-conflict' }

const ActiveMatchConfig = v.pipe(
  v.object({ ...MatchConfig.entries, gameKey: RegisteredGameKey }),
  v.readonly(),
)

const MatchRecordFields = {
  matchId: MatchId,
  controlSecret: v.pipe(v.string(), v.minLength(16)),
  configJson: v.pipe(v.string(), v.parseJson(), ActiveMatchConfig),
  latestSeq: NonNegativeInteger,
  scoreJson: v.pipe(v.string(), v.parseJson(), MatchScoreProjection),
  createdAt: UnixEpochMilliseconds,
}

const MatchRecord = v.pipe(
  v.variant('status', [
    v.object({ ...MatchRecordFields, status: v.literal('active'), endedAt: v.null() }),
    v.object({ ...MatchRecordFields, status: v.literal('finalizing'), endedAt: UnixEpochMilliseconds }),
  ]),
  v.transform(({ configJson, scoreJson, ...row }) => ({
    ...row,
    config: configJson,
    score: scoreJson,
  })),
  v.check((row) => row.matchId === row.config.matchId),
  v.readonly(),
)

export type MatchRecord = v.InferOutput<typeof MatchRecord>

export type ActiveMatchRecord = Extract<MatchRecord, { status: 'active' }>

export type FinalizingMatchRecord = Extract<MatchRecord, { status: 'finalizing' }>

export function matchRecordFromRow(row: typeof schema.activeMatches.$inferSelect): MatchRecord {
  try {
    return v.parse(MatchRecord, row)
  } catch (cause) {
    throw new Error('MatchRoom active_matches storage corruption', { cause })
  }
}

export function commandFromRow(row: typeof schema.commands.$inferSelect): MatchCommand {
  try {
    return v.parse(v.pipe(v.string(), v.parseJson(), MatchCommand), row.requestJson)
  } catch (cause) {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`, { cause })
  }
}

export function commandReceiptFromRow(row: typeof schema.commands.$inferSelect): CommandReceipt {
  try {
    if (row.outcome === 'accepted')
      return v.parse(CommandReceipt, { _tag: 'accepted', acceptedSeq: row.acceptedSeq })
    const rejectionReason: unknown = JSON.parse(row.rejectionJson ?? '')

    return v.parse(CommandReceipt, { _tag: 'rejected', reason: rejectionReason })
  } catch (cause) {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`, { cause })
  }
}

export function checkpointFromRow(
  row: typeof schema.checkpoints.$inferSelect,
  matchRecord: MatchRecord,
): MatchCheckpoint {
  try {
    const checkpoint = v.parse(v.pipe(v.string(), v.parseJson(), MatchCheckpoint), row.aggregateJson)

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
): RegisteredProtocolEntry {
  try {
    const entry = parseProtocolEntry(v.parse(v.pipe(v.string(), v.parseJson(), ProtocolEntry), row.entryJson))

    if (entry.acceptedSeq !== row.acceptedSeq || entry.entryIndex !== row.entryIndex)
      throw new Error('position mismatch')

    return entry
  } catch (cause) {
    throw new Error('MatchRoom Protocol storage corruption', { cause })
  }
}
