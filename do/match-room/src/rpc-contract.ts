import {
  ControlCommandSchema,
  GameConfigurationSchema,
  MatchConfigSchema,
  MatchIdSchema,
  MatchSeatAssignmentSchema,
  MatchTargetsSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  SeatSchema,
} from '@ks/core'
import * as v from 'valibot'

const ControlSecretSchema = v.pipe(v.string(), v.minLength(16))

export const InitBodySchema = v.object({
  matchId: MatchIdSchema,
  controlSecret: ControlSecretSchema,
  config: MatchConfigSchema,
})

export const CreateBodySchema = v.object({
  matchId: MatchIdSchema,
  controlSecret: ControlSecretSchema,
  gameKey: NonEmptyStringSchema,
  targets: MatchTargetsSchema,
  firstBreakerSeat: SeatSchema,
  gameConfiguration: v.optional(GameConfigurationSchema),
  participants: v.tuple([MatchSeatAssignmentSchema, MatchSeatAssignmentSchema]),
})

export const FactsBodySchema = v.object({
  matchId: MatchIdSchema,
  controlSecret: ControlSecretSchema,
  commands: v.pipe(v.array(ControlCommandSchema), v.minLength(1)),
})

export const SnapshotBodySchema = v.object({
  matchId: MatchIdSchema,
})

export const StreamBodySchema = v.object({
  matchId: MatchIdSchema,
  since: v.optional(NonNegativeIntegerSchema),
})

export type InitBody = v.InferInput<typeof InitBodySchema>
export type CreateBody = v.InferInput<typeof CreateBodySchema>
export type FactsBody = v.InferInput<typeof FactsBodySchema>
export type SnapshotBody = v.InferInput<typeof SnapshotBodySchema>
export type StreamBody = v.InferInput<typeof StreamBodySchema>
