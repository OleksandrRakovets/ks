import * as v from 'valibot'

import { MatchId, PlayerRef } from './ids'
import { Integer, NonNegativeInteger, PositiveInteger, SizedString } from './valicombos'

export const Seat = v.picklist(['A', 'B'])
export type Seat = v.InferOutput<typeof Seat>

export function opponentOf(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A'
}

export const GameKey = v.pipe(SizedString(1, 64), v.regex(/^[a-z0-9-]+$/))
export type GameKey = v.InferOutput<typeof GameKey>

export const BySeatNumber = v.object({ A: Integer, B: Integer })
export type BySeatNumber = v.InferOutput<typeof BySeatNumber>

export const MatchTargets = v.object({
  frameTargetPointsBySeat: v.object({ A: PositiveInteger, B: PositiveInteger }),
  matchTargetFrames: PositiveInteger,
})
export type MatchTargets = v.InferOutput<typeof MatchTargets>

export const GameConfiguration = v.object({
  rackRollover: v.optional(v.picklist([14, 15])),
})
export type GameConfiguration = v.InferOutput<typeof GameConfiguration>

export const MatchSeatAssignment = v.object({
  seat: Seat,
  playerRef: PlayerRef,
})
export type MatchSeatAssignment = v.InferOutput<typeof MatchSeatAssignment>

export const HydratedMatchParticipant = v.object({
  playerRef: PlayerRef,
  displayName: SizedString(1, 128),
  shortDisplayName: SizedString(1, 128),
})
export type HydratedMatchParticipant = v.InferOutput<typeof HydratedMatchParticipant>

const HydratedMatchParticipants = v.object({
  A: HydratedMatchParticipant,
  B: HydratedMatchParticipant,
})
export type HydratedMatchParticipants = v.InferOutput<typeof HydratedMatchParticipants>

export const MatchConfig = v.object({
  matchId: MatchId,
  gameKey: GameKey,
  targets: MatchTargets,
  firstBreakerSeat: Seat,
  gameConfiguration: v.optional(GameConfiguration),
})

export type MatchConfig = v.InferOutput<typeof MatchConfig>

const FrameState = v.object({
  frameIndex: PositiveInteger,
  pointsBySeat: BySeatNumber,
  breakerSeat: Seat,
  winnerSeat: v.optional(Seat),
})
export type FrameState = v.InferOutput<typeof FrameState>

const FrameWinReason = v.picklist(['target-reached', 'conceded'])

export const FrameOutcome = v.object({
  winnerSeat: Seat,
  score: BySeatNumber,
  winReason: FrameWinReason,
})
export type FrameOutcome = v.InferOutput<typeof FrameOutcome>

export const MatchState = v.object({
  matchId: MatchId,
  gameKey: GameKey,
  targets: MatchTargets,
  status: v.picklist(['active', 'finished']),
  currentFrameIndex: NonNegativeInteger,
  framesWonBySeat: BySeatNumber,
  frames: v.array(FrameState),
})
export type MatchState = v.InferOutput<typeof MatchState>
