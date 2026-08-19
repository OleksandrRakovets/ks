import {
  MatchConfigSchema,
  MatchIdSchema,
  MatchSeatAssignmentSchema,
  PositiveIntegerSchema,
  GameConfigurationSchema,
  SeatSchema,
  stripOptionalPrefix,
  type MatchConfig,
} from '@ks/core'
import { isRegisteredGameKey } from '@ks/gameplay/definitions'
import * as v from 'valibot'

export const CreateMatchRequestSchema = v.pipe(
  v.object({
    gameKey: v.pipe(v.string(), v.minLength(1)),
    targets: v.object({
      frameTargetPointsBySeat: v.object({
        A: PositiveIntegerSchema,
        B: PositiveIntegerSchema,
      }),
      matchTargetFrames: PositiveIntegerSchema,
    }),
    firstBreakerSeat: SeatSchema,
    gameConfiguration: v.optional(GameConfigurationSchema),
    participants: v.tuple([MatchSeatAssignmentSchema, MatchSeatAssignmentSchema]),
  }),
  v.check((value) => isRegisteredGameKey(value.gameKey), 'Unsupported game key'),
  v.check(
    (value) =>
      value.gameKey !== 'free-pyramid-long' ||
      value.gameConfiguration?.rackRollover === 14 ||
      value.gameConfiguration?.rackRollover === 15,
    'Long free pyramid requires rack rollover configuration',
  ),
  v.check(
    (value) => new Set(value.participants.map((participant) => participant.seat)).size === 2,
    'Participants must include one A and one B seat',
  ),
)

export type CreateMatchRequest = v.InferOutput<typeof CreateMatchRequestSchema>

type MatchAssignmentsBySeat = { A: string; B: string }

export function assignmentsBySeat(participants: CreateMatchRequest['participants']): MatchAssignmentsBySeat {
  const seatA = participants.find((participant) => participant.seat === 'A')
  const seatB = participants.find((participant) => participant.seat === 'B')
  if (!seatA || !seatB) {
    throw new Error('Participants must include one A and one B seat')
  }
  return {
    A: seatA.playerRef,
    B: seatB.playerRef,
  }
}

export function buildMatchConfig(matchId: string, input: CreateMatchRequest): MatchConfig {
  return v.parse(MatchConfigSchema, {
    matchId,
    gameKey: input.gameKey,
    targets: input.targets,
    firstBreakerSeat: input.firstBreakerSeat,
    gameConfiguration: input.gameConfiguration,
  })
}

export function normalizeMatchId(raw: string): string {
  return v.parse(MatchIdSchema, stripOptionalPrefix(raw))
}
