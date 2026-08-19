import {
  ControlCommandSchema,
  CommandIdSchema,
  GameConfigurationSchema,
  MatchIdSchema,
  MatchSeatAssignmentSchema,
  MatchTargetsSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  SeatSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import * as v from 'valibot'

const ControlSecretSchema = v.pipe(v.string(), v.minLength(16))

export const CreateBodySchema = v.object({
  matchId: MatchIdSchema,
  controlSecret: ControlSecretSchema,
  gameKey: NonEmptyStringSchema,
  targets: MatchTargetsSchema,
  firstBreakerSeat: SeatSchema,
  gameConfiguration: v.optional(GameConfigurationSchema),
  participants: v.tuple([MatchSeatAssignmentSchema, MatchSeatAssignmentSchema]),
  createdAt: UnixEpochMillisecondsSchema,
})

export const FactsBodySchema = v.object({
  matchId: MatchIdSchema,
  commandId: CommandIdSchema,
  command: ControlCommandSchema,
})

export const SnapshotBodySchema = v.object({
  matchId: MatchIdSchema,
})

export const StreamBodySchema = v.object({
  matchId: MatchIdSchema,
  since: v.optional(NonNegativeIntegerSchema),
})

export type CreateBody = v.InferInput<typeof CreateBodySchema>
export type FactsBody = v.InferInput<typeof FactsBodySchema>
export type SnapshotBody = v.InferInput<typeof SnapshotBodySchema>
export type StreamBody = v.InferInput<typeof StreamBodySchema>
