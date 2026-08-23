import * as v from 'valibot'

import { AcceptedFactRefSchema, StoredMatchFactSchema } from './facts'
import { HydratedMatchParticipantsSchema, MatchStateSchema } from './match'
import { NonEmptyStringSchema, NonNegativeIntegerSchema, UnknownObjectSchema } from './valicombos'

export const ErrorResponseSchema = v.object({
  ok: v.literal(false),
  error: NonEmptyStringSchema,
})

export const SnapshotResponseSchema = v.union([
  v.object({
    ok: v.literal(true),
    state: MatchStateSchema,
    latestSeq: NonNegativeIntegerSchema,
    participants: HydratedMatchParticipantsSchema,
    controlProjection: v.optional(v.unknown()),
  }),
  ErrorResponseSchema,
])

const PostFactsAcceptedOutcomeSchema = v.object({
  _tag: v.literal('accepted'),
  accepted: v.pipe(v.array(AcceptedFactRefSchema), v.minLength(1)),
})

const PostFactsRejectedOutcomeSchema = v.object({
  _tag: v.literal('rejected'),
  reason: UnknownObjectSchema,
})

export const PostFactsResponseSchema = v.union([
  v.object({
    ok: v.literal(true),
    outcome: v.variant('_tag', [PostFactsAcceptedOutcomeSchema, PostFactsRejectedOutcomeSchema]),
    finalizing: v.optional(v.literal(true)),
  }),
  ErrorResponseSchema,
])

export const StreamReadySchema = v.object({
  latestSeq: NonNegativeIntegerSchema,
})

export const StreamFactSchema = StoredMatchFactSchema
