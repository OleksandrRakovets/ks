import {
  ClientIdSchema,
  FactIdSchema,
  MatchIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  type StoredFact,
  StoredFactSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import * as v from 'valibot'

import * as schema from './schema'

const AcceptedFactColumnsSchema = v.object({
  seq: PositiveIntegerSchema,
  factId: FactIdSchema,
  matchId: MatchIdSchema,
  type: v.string(),
  payloadJson: v.pipe(v.string(), v.parseJson()),
  clientId: ClientIdSchema,
  clientSeq: NonNegativeIntegerSchema,
  at: UnixEpochMillisecondsSchema,
  receivedAt: UnixEpochMillisecondsSchema,
})

const StoredFactRowSchema = v.pipe(
  AcceptedFactColumnsSchema,
  v.transform(({ payloadJson, ...row }): v.InferInput<typeof StoredFactSchema> => {
    // SAFETY: TypeScript cannot correlate the dynamic discriminator with decoded JSON; StoredFactSchema validates it next.
    return { ...row, payload: payloadJson } as v.InferInput<typeof StoredFactSchema>
  }),
  StoredFactSchema,
)

export type StoredFactRow = v.InferInput<typeof AcceptedFactColumnsSchema>

export function decodeStoredFactRow(row: StoredFactRow): StoredFact {
  return v.parse(StoredFactRowSchema, row)
}

export function encodeStoredFactRow(fact: StoredFact): typeof schema.acceptedFacts.$inferSelect {
  return {
    seq: fact.seq,
    factId: fact.factId,
    matchId: fact.matchId,
    type: fact.type,
    payloadJson: JSON.stringify(fact.payload),
    clientId: fact.clientId,
    clientSeq: fact.clientSeq,
    at: fact.at,
    receivedAt: fact.receivedAt,
  }
}
