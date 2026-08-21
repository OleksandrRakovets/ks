import * as v from 'valibot'

import { StoredFactSchema } from './facts'
import { FactIdSchema } from './ids'
import { HydratedMatchParticipantsSchema, MatchSnapshotSchema } from './match'
import { NonEmptyStringSchema, NonNegativeIntegerSchema, PositiveIntegerSchema } from './valicombos'

export const ErrorResponseSchema = v.object({
  ok: v.literal(false),
  error: NonEmptyStringSchema,
})

export const SnapshotResponseSchema = v.union([
  v.object({
    ok: v.literal(true),
    snapshot: MatchSnapshotSchema,
    participants: HydratedMatchParticipantsSchema,
    controlProjection: v.optional(v.unknown()),
  }),
  ErrorResponseSchema,
])

export const AcceptedFactSchema = v.object({
  seq: PositiveIntegerSchema,
  factId: FactIdSchema,
})
export type AcceptedFact = v.InferOutput<typeof AcceptedFactSchema>

export const PostFactsResponseSchema = v.union([
  v.object({
    ok: v.literal(true),
    accepted: v.array(AcceptedFactSchema),
  }),
  ErrorResponseSchema,
])

export const StreamReadySchema = v.object({
  latestSeq: NonNegativeIntegerSchema,
})

export const StreamFactSchema = StoredFactSchema
