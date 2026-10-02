import { Schema } from 'effect'

import { PlayerRef } from './ids'
import { Integer, PositiveInteger, SizedString } from './valicombos'

export const Seat = Schema.Literals(['A', 'B'])

export function opponentOf(seat: typeof Seat.Type): typeof Seat.Type {
  return seat === 'A' ? 'B' : 'A'
}

export const BySeatNumber = Schema.Struct({ A: Integer, B: Integer })

export const MatchTargets = Schema.Struct({
  frameTargetPointsBySeat: Schema.Struct({ A: PositiveInteger, B: PositiveInteger }),
  matchTargetFrames: PositiveInteger,
})

export const GameConfiguration = Schema.Struct({
  rackRollover: Schema.optional(Schema.Literals([14, 15])),
})

export const MatchSeatAssignment = Schema.Struct({
  seat: Seat,
  playerRef: PlayerRef,
})

export const HydratedMatchParticipant = Schema.Struct({
  playerRef: PlayerRef,
  displayName: SizedString(1, 128),
  shortDisplayName: SizedString(1, 128),
})

export const HydratedMatchParticipants = Schema.Struct({
  A: HydratedMatchParticipant,
  B: HydratedMatchParticipant,
})

/** Gameplay owns the specific winning condition; competition only distinguishes it from concession. */
export const FrameWinReason = Schema.Literals(['game-rules', 'conceded'])

export const FrameOutcome = Schema.Struct({
  winnerSeat: Seat,
  score: BySeatNumber,
  winReason: FrameWinReason,
})
