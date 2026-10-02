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
import { Schema, SchemaGetter } from 'effect'

export const MatchCreationDefinition = Schema.Struct({
  gameKey: GameKey,
  targets: MatchTargets,
  firstBreakerSeat: Seat,
  gameConfiguration: Schema.optional(GameConfiguration),
}).check(
  Schema.makeFilter(
    (value) =>
      value.gameKey !== 'free-pyramid-long' ||
      value.gameConfiguration?.rackRollover === 14 ||
      value.gameConfiguration?.rackRollover === 15,
    { message: 'Long free pyramid requires rack rollover configuration' },
  ),
  Schema.makeFilter(
    (value) => value.gameKey !== 'free-pyramid-long' || value.targets.matchTargetFrames === 1,
    { message: 'Long free pyramid requires a single frame' },
  ),
)

export const CreateMatchRequest = MatchCreationDefinition.mapFields(
  (fields) => ({
    ...fields,
    participants: Schema.TupleWithRest(Schema.Tuple([MatchSeatAssignment, MatchSeatAssignment]), [
      Schema.Unknown,
    ]).pipe(
      Schema.decodeTo(Schema.toType(Schema.Tuple([MatchSeatAssignment, MatchSeatAssignment])), {
        decode: SchemaGetter.transform(([a, b]) => [a, b] as const),
        encode: SchemaGetter.transform((participants) => participants),
      }),
    ),
  }),
  // These checks depend only on the unchanged creation fields.
  { unsafePreserveChecks: true },
).check(
  Schema.makeFilter((value) => new Set(value.participants.map((participant) => participant.seat)).size === 2, {
    message: 'Participants must include one A and one B seat',
  }),
)

export const MatchConfig = Schema.Struct({
  matchId: MatchId,
  gameKey: GameKey,
  targets: MatchTargets,
  firstBreakerSeat: Seat,
  gameConfiguration: Schema.optional(GameConfiguration),
})

export function buildMatchConfig(
  matchId: typeof MatchId.Type,
  input: typeof CreateMatchRequest.Type,
): typeof MatchConfig.Type {
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

export const FrameState = Schema.Struct({
  frameIndex: PositiveInteger,
  pointsBySeat: BySeatNumber,
  breakerSeat: Seat,
  winnerSeat: Schema.optional(Seat),
})

const MatchStateFields = {
  matchId: MatchId,
  gameKey: GameKey,
  targets: MatchTargets,
  gameConfiguration: Schema.optional(GameConfiguration),
  currentFrameIndex: NonNegativeInteger,
  framesWonBySeat: BySeatNumber,
  frames: Schema.Array(FrameState),
}

const ActiveMatchState = Schema.Struct({
  ...MatchStateFields,
  status: Schema.Literal('active'),
  winnerSeat: Schema.Null,
})

export const FinishedMatchState = Schema.Struct({
  ...MatchStateFields,
  status: Schema.Literal('finished'),
  winnerSeat: Seat,
})

export const MatchState = Schema.Union([ActiveMatchState, FinishedMatchState])

export type MatchStateFor<K extends typeof GameKey.Type> = typeof MatchState.Type & { readonly gameKey: K }

const ActiveFrameScoreProjection = Schema.Struct({
  frameIndex: PositiveInteger,
  pointsBySeat: BySeatNumber,
})

export const MatchScoreProjection = Schema.Struct({
  matchTargetFrames: PositiveInteger,
  frameTargetPointsBySeat: Schema.Struct({ A: PositiveInteger, B: PositiveInteger }),
  framesWonBySeat: BySeatNumber,
  winnerSeat: Schema.NullOr(Seat),
  singleFramePointsBySeat: Schema.NullOr(BySeatNumber),
  activeFrame: Schema.NullOr(ActiveFrameScoreProjection),
})

/** Derives the compact list score without treating the last completed Frame as active. */
export function projectMatchScore(state: typeof MatchState.Type): typeof MatchScoreProjection.Type {
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
    winnerSeat: state.winnerSeat,
    singleFramePointsBySeat:
      state.targets.matchTargetFrames === 1 ? (representedFrame?.pointsBySeat ?? null) : null,
    activeFrame: currentFrame
      ? { frameIndex: currentFrame.frameIndex, pointsBySeat: currentFrame.pointsBySeat }
      : null,
  }
}
