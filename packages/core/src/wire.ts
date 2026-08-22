import * as v from 'valibot'

import { AcceptedFactRefSchema, StoredMatchFactSchema } from './facts'
import { HydratedMatchParticipantsSchema, MatchSnapshotSchema } from './match'
import { NonEmptyStringSchema, NonNegativeIntegerSchema } from './valicombos'

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

export type AcceptedFact = v.InferOutput<typeof AcceptedFactRefSchema>

export const PostFactsResponseSchema = v.union([
  v.object({
    ok: v.literal(true),
    accepted: v.array(AcceptedFactRefSchema),
  }),
  ErrorResponseSchema,
])

export const StreamReadySchema = v.object({
  latestSeq: NonNegativeIntegerSchema,
})

export const StreamFactSchema = StoredMatchFactSchema
