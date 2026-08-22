import {
  CommandIdSchema,
  FactIdSchema,
  MatchIdSchema,
  PositiveIntegerSchema,
  type StoredMatchFact,
  StoredMatchFactSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import * as v from 'valibot'

import * as schema from './schema'

const StoredMatchFactColumnsSchema = v.object({
  seq: PositiveIntegerSchema,
  factId: FactIdSchema,
  matchId: MatchIdSchema,
  type: v.string(),
  payloadJson: v.pipe(v.string(), v.parseJson()),
  occurredAt: UnixEpochMillisecondsSchema,
  causedByCommandId: v.nullable(CommandIdSchema),
  receivedAt: UnixEpochMillisecondsSchema,
})

export type StoredMatchFactRow = v.InferInput<typeof StoredMatchFactColumnsSchema>

export function decodeStoredMatchFactRow(row: StoredMatchFactRow): StoredMatchFact {
  const columns = v.parse(StoredMatchFactColumnsSchema, row)
  return v.parse(StoredMatchFactSchema, {
    seq: columns.seq,
    factId: columns.factId,
    matchId: columns.matchId,
    type: columns.type,
    payload: columns.payloadJson,
    occurredAt: columns.occurredAt,
    causedByCommandId: columns.causedByCommandId,
    receivedAt: columns.receivedAt,
  })
}

export function encodeStoredMatchFactRow(fact: StoredMatchFact): typeof schema.acceptedFacts.$inferSelect {
  return {
    seq: fact.seq,
    factId: fact.factId,
    matchId: fact.matchId,
    type: fact.type,
    payloadJson: JSON.stringify(fact.payload),
    occurredAt: fact.occurredAt,
    causedByCommandId: fact.causedByCommandId,
    receivedAt: fact.receivedAt,
  }
}
