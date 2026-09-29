import * as v from 'valibot'

import { PlayerRef } from './ids'
import { Integer, PositiveInteger, SizedString } from './valicombos'

export const Seat = v.picklist(['A', 'B'])

export type Seat = v.InferOutput<typeof Seat>

export function opponentOf(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A'
}

export const BySeatNumber = v.pipe(v.object({ A: Integer, B: Integer }), v.readonly())

export type BySeatNumber = v.InferOutput<typeof BySeatNumber>

export const MatchTargets = v.pipe(
  v.object({
    frameTargetPointsBySeat: v.pipe(v.object({ A: PositiveInteger, B: PositiveInteger }), v.readonly()),
    matchTargetFrames: PositiveInteger,
  }),
  v.readonly(),
)

export type MatchTargets = v.InferOutput<typeof MatchTargets>

export const GameConfiguration = v.pipe(
  v.object({
    rackRollover: v.optional(v.picklist([14, 15])),
  }),
  v.readonly(),
)

export type GameConfiguration = v.InferOutput<typeof GameConfiguration>

export const MatchSeatAssignment = v.pipe(
  v.object({
    seat: Seat,
    playerRef: PlayerRef,
  }),
  v.readonly(),
)

export type MatchSeatAssignment = v.InferOutput<typeof MatchSeatAssignment>

export const HydratedMatchParticipant = v.pipe(
  v.object({
    playerRef: PlayerRef,
    displayName: SizedString(1, 128),
    shortDisplayName: SizedString(1, 128),
  }),
  v.readonly(),
)

export type HydratedMatchParticipant = v.InferOutput<typeof HydratedMatchParticipant>

const HydratedMatchParticipants = v.pipe(
  v.object({
    A: HydratedMatchParticipant,
    B: HydratedMatchParticipant,
  }),
  v.readonly(),
)

export type HydratedMatchParticipants = v.InferOutput<typeof HydratedMatchParticipants>

/** Gameplay owns the specific winning condition; competition only distinguishes it from concession. */
export const FrameWinReason = v.picklist(['game-rules', 'conceded'])

export type FrameWinReason = v.InferOutput<typeof FrameWinReason>

export const FrameOutcome = v.pipe(
  v.object({
    winnerSeat: Seat,
    score: BySeatNumber,
    winReason: FrameWinReason,
  }),
  v.readonly(),
)

export type FrameOutcome = v.InferOutput<typeof FrameOutcome>
