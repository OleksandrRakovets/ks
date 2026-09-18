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

export const MatchConfig = v.pipe(
  v.object({
    matchId: MatchId,
    gameKey: GameKey,
    targets: MatchTargets,
    firstBreakerSeat: Seat,
    gameConfiguration: v.optional(GameConfiguration),
  }),
  v.readonly(),
)

export type MatchConfig = v.InferOutput<typeof MatchConfig>

const FrameState = v.pipe(
  v.object({
    frameIndex: PositiveInteger,
    pointsBySeat: BySeatNumber,
    breakerSeat: Seat,
    winnerSeat: v.optional(Seat),
  }),
  v.readonly(),
)

export type FrameState = v.InferOutput<typeof FrameState>

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

export const MatchState = v.pipe(
  v.object({
    matchId: MatchId,
    gameKey: GameKey,
    targets: MatchTargets,
    status: v.picklist(['active', 'finished']),
    currentFrameIndex: NonNegativeInteger,
    framesWonBySeat: BySeatNumber,
    frames: v.pipe(v.array(FrameState), v.readonly()),
  }),
  v.readonly(),
)

export type MatchState = v.InferOutput<typeof MatchState>

export const ActiveFrameScoreProjection = v.pipe(
  v.object({
    frameIndex: PositiveInteger,
    pointsBySeat: BySeatNumber,
  }),
  v.readonly(),
)

export type ActiveFrameScoreProjection = v.InferOutput<typeof ActiveFrameScoreProjection>

export const MatchScoreProjection = v.pipe(
  v.object({
    matchTargetFrames: PositiveInteger,
    framesWonBySeat: BySeatNumber,
    singleFramePointsBySeat: v.nullable(BySeatNumber),
    activeFrame: v.nullable(ActiveFrameScoreProjection),
  }),
  v.readonly(),
)

export type MatchScoreProjection = v.InferOutput<typeof MatchScoreProjection>

/** Derives the compact list score without treating the last completed Frame as active. */
export function projectMatchScore(state: MatchState): MatchScoreProjection {
  const representedFrame = state.frames.find((frame) => frame.frameIndex === state.currentFrameIndex)

  const currentFrame =
    state.status === 'active'
      ? representedFrame?.winnerSeat === undefined
        ? representedFrame
        : undefined
      : undefined

  return {
    matchTargetFrames: state.targets.matchTargetFrames,
    framesWonBySeat: state.framesWonBySeat,
    singleFramePointsBySeat:
      state.targets.matchTargetFrames === 1 ? (representedFrame?.pointsBySeat ?? null) : null,
    activeFrame: currentFrame
      ? { frameIndex: currentFrame.frameIndex, pointsBySeat: currentFrame.pointsBySeat }
      : null,
  }
}
