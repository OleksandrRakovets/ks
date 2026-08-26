import * as v from 'valibot'

import { MatchIdSchema, PlayerRefSchema } from './ids'
import { IntegerSchema, NonNegativeIntegerSchema, PositiveIntegerSchema, SizedStringSchema } from './valicombos'

export const SeatSchema = v.picklist(['A', 'B'])
export type Seat = v.InferOutput<typeof SeatSchema>

export function opponentOf(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A'
}

export const GameKeySchema = v.pipe(SizedStringSchema(1, 64), v.regex(/^[a-z0-9-]+$/))
export type GameKey = v.InferOutput<typeof GameKeySchema>

export const BySeatNumberSchema = v.object({ A: IntegerSchema, B: IntegerSchema })
export type BySeatNumber = v.InferOutput<typeof BySeatNumberSchema>

export const MatchTargetsSchema = v.object({
  frameTargetPointsBySeat: v.object({ A: PositiveIntegerSchema, B: PositiveIntegerSchema }),
  matchTargetFrames: PositiveIntegerSchema,
})

export const GameConfigurationSchema = v.object({
  rackRollover: v.optional(v.picklist([14, 15])),
})

export const MatchSeatAssignmentSchema = v.object({
  seat: SeatSchema,
  playerRef: PlayerRefSchema,
})

export const HydratedMatchParticipantSchema = v.object({
  playerRef: PlayerRefSchema,
  displayName: SizedStringSchema(1, 128),
  shortDisplayName: SizedStringSchema(1, 128),
})
export type HydratedMatchParticipant = v.InferOutput<typeof HydratedMatchParticipantSchema>

const HydratedMatchParticipantsSchema = v.object({
  A: HydratedMatchParticipantSchema,
  B: HydratedMatchParticipantSchema,
})
export type HydratedMatchParticipants = v.InferOutput<typeof HydratedMatchParticipantsSchema>

export const MatchConfigSchema = v.object({
  matchId: MatchIdSchema,
  gameKey: GameKeySchema,
  targets: MatchTargetsSchema,
  firstBreakerSeat: SeatSchema,
  gameConfiguration: v.optional(GameConfigurationSchema),
})

export type MatchConfig = v.InferOutput<typeof MatchConfigSchema>

const FrameStateSchema = v.object({
  frameIndex: PositiveIntegerSchema,
  pointsBySeat: BySeatNumberSchema,
  breakerSeat: SeatSchema,
  winnerSeat: v.optional(SeatSchema),
})
export type FrameState = v.InferOutput<typeof FrameStateSchema>

const FrameWinReasonSchema = v.picklist(['target-reached', 'conceded'])

export const FrameOutcomeSchema = v.object({
  winnerSeat: SeatSchema,
  score: BySeatNumberSchema,
  winReason: FrameWinReasonSchema,
})
export type FrameOutcome = v.InferOutput<typeof FrameOutcomeSchema>

export const MatchStateSchema = v.object({
  matchId: MatchIdSchema,
  gameKey: GameKeySchema,
  targets: MatchTargetsSchema,
  status: v.picklist(['active', 'finished']),
  currentFrameIndex: NonNegativeIntegerSchema,
  framesWonBySeat: BySeatNumberSchema,
  frames: v.array(FrameStateSchema),
})
export type MatchState = v.InferOutput<typeof MatchStateSchema>
