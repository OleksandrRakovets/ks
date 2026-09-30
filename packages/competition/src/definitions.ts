/** Browser/server shared Match definitions and projections; this entrypoint excludes executable machines. */
import {
  BySeatNumber,
  GameConfiguration,
  MatchId,
  MatchSeatAssignment,
  MatchTargets,
  NonNegativeInteger,
  PositiveInteger,
  Seat,
} from '@ks/core'
import { GameKey } from '@ks/gameplay/definitions'
import * as v from 'valibot'

export const MatchCreationDefinition = v.pipe(
  v.object({
    gameKey: GameKey,
    targets: MatchTargets,
    firstBreakerSeat: Seat,
    gameConfiguration: v.optional(GameConfiguration),
  }),
  v.check(
    (value) =>
      value.gameKey !== 'free-pyramid-long' ||
      value.gameConfiguration?.rackRollover === 14 ||
      value.gameConfiguration?.rackRollover === 15,
    'Long free pyramid requires rack rollover configuration',
  ),
  v.check(
    (value) => value.gameKey !== 'free-pyramid-long' || value.targets.matchTargetFrames === 1,
    'Long free pyramid requires a single frame',
  ),
  v.readonly(),
)

export type MatchCreationDefinition = v.InferOutput<typeof MatchCreationDefinition>

export const CreateMatchRequest = v.pipe(
  v.intersect([
    MatchCreationDefinition,
    v.object({
      participants: v.pipe(v.tuple([MatchSeatAssignment, MatchSeatAssignment]), v.readonly()),
    }),
  ]),
  v.check(
    (value) => new Set(value.participants.map((participant) => participant.seat)).size === 2,
    'Participants must include one A and one B seat',
  ),
  v.readonly(),
)

export type CreateMatchRequest = v.InferOutput<typeof CreateMatchRequest>

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

export function buildMatchConfig(matchId: MatchId, input: CreateMatchRequest): MatchConfig {
  const config = {
    matchId,
    gameKey: input.gameKey,
    targets: input.targets,
    firstBreakerSeat: input.firstBreakerSeat,
  }

  // Omit absent optional values so MatchConfig remains structurally equal after JSON persistence round-trips.
  return input.gameConfiguration === undefined
    ? config
    : { ...config, gameConfiguration: input.gameConfiguration }
}

export const FrameState = v.pipe(
  v.object({
    frameIndex: PositiveInteger,
    pointsBySeat: BySeatNumber,
    breakerSeat: Seat,
    winnerSeat: v.optional(Seat),
  }),
  v.readonly(),
)

export type FrameState = v.InferOutput<typeof FrameState>

export const MatchState = v.pipe(
  v.object({
    matchId: MatchId,
    gameKey: GameKey,
    targets: MatchTargets,
    gameConfiguration: v.optional(GameConfiguration),
    status: v.picklist(['active', 'finished']),
    currentFrameIndex: NonNegativeInteger,
    framesWonBySeat: BySeatNumber,
    frames: v.pipe(v.array(FrameState), v.readonly()),
  }),
  v.readonly(),
)

export type MatchState = v.InferOutput<typeof MatchState>

export type MatchStateFor<K extends GameKey> = Omit<MatchState, 'gameKey'> & { readonly gameKey: K }

const ActiveFrameScoreProjection = v.pipe(
  v.object({
    frameIndex: PositiveInteger,
    pointsBySeat: BySeatNumber,
  }),
  v.readonly(),
)

export const MatchScoreProjection = v.pipe(
  v.object({
    matchTargetFrames: PositiveInteger,
    frameTargetPointsBySeat: v.pipe(v.object({ A: PositiveInteger, B: PositiveInteger }), v.readonly()),
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
    frameTargetPointsBySeat: state.targets.frameTargetPointsBySeat,
    framesWonBySeat: state.framesWonBySeat,
    singleFramePointsBySeat:
      state.targets.matchTargetFrames === 1 ? (representedFrame?.pointsBySeat ?? null) : null,
    activeFrame: currentFrame
      ? { frameIndex: currentFrame.frameIndex, pointsBySeat: currentFrame.pointsBySeat }
      : null,
  }
}
