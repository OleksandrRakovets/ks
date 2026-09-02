import { BySeatNumber, ControlSections, GameProtocolEntry, NonEmptyString, Seat } from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommand, FrameAwardCommand, FrameCommenceCommand } from '../command-schemas'
import { GameControlProjection } from '../constants'

const CueBall = v.literal(0)
const ColoredBall = v.union([
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6),
  v.literal(7),
])
export type StrilaColoredBall = v.InferOutput<typeof ColoredBall>
const COLORED_BALLS: readonly StrilaColoredBall[] = [1, 2, 3, 4, 5, 6, 7]

const Ball = v.union([CueBall, ColoredBall])
export type StrilaBall = v.InferOutput<typeof Ball>
const BALLS: readonly StrilaBall[] = [0, ...COLORED_BALLS]

const PottedBalls = v.pipe(
  v.array(Ball),
  v.minLength(1),
  v.check((balls) => new Set(balls).size === balls.length, 'Potted balls must be unique'),
)

export const StrilaMeta = {
  allBalls: BALLS,
  coloredBalls: COLORED_BALLS,
  cueBall: CueBall.literal,
  defaultTargetPoints: { A: 9, B: 9 },
}

const FoulResponseChoice = v.picklist(['play-from-position', 'pass-position', 'ball-in-hand'])

export const StrilaCommand = v.variant('type', [
  FrameCommenceCommand,
  v.strictObject({ type: v.literal('pot.record'), seat: Seat, pottedBalls: PottedBalls }),
  v.strictObject({ type: v.literal('miss.record'), seat: Seat }),
  FoulCommitCommand,
  v.strictObject({ type: v.literal('penalty.select'), seat: Seat, choice: FoulResponseChoice }),
  FrameAwardCommand,
])
export type StrilaCommand = v.InferOutput<typeof StrilaCommand>

export const StrilaPhase = v.picklist([
  'not-started',
  'open-play',
  'foul-committed.penalty-selection',
  'foul-committed.ball-in-hand',
  'respotted-black.opening',
  'respotted-black.play',
  'winner-determined',
  'frame-over',
])
export type StrilaPhase = v.InferOutput<typeof StrilaPhase>

const WinnerDeterminationReason = v.picklist(['target-reached', 'respotted-black-won', 'automatic-foul'])

const StrilaContext = v.object({
  score: BySeatNumber,
  targetPoints: BySeatNumber,
  coloredBallsOnTable: v.array(ColoredBall),
  cueBallSerialPots: v.nullable(
    v.object({
      seat: Seat,
      count: v.union([v.literal(1), v.literal(2)]),
    }),
  ),
  foulOffender: v.nullable(Seat),
  winner: v.nullable(Seat),
  winnerDeterminationReason: v.nullable(WinnerDeterminationReason),
})
export type StrilaContext = v.InferOutput<typeof StrilaContext>

const BallStatus = v.picklist(['object', 'on-table', 'potted'])
export const StrilaBallStatuses = v.object({
  0: BallStatus,
  1: BallStatus,
  2: BallStatus,
  3: BallStatus,
  4: BallStatus,
  5: BallStatus,
  6: BallStatus,
  7: BallStatus,
})

const ControlMessage = v.object({
  type: v.picklist(['hint', 'warning']),
  code: v.picklist(['cue-ball-and-colored-is-foul', 'black-pot-wins']),
})

const StrilaControlProjectionDetails = v.object({
  phase: StrilaPhase,
  seat: v.optional(Seat),
  situationTitle: NonEmptyString,
  situationSummary: v.optional(NonEmptyString),
  isPotCommandAvailable: v.boolean(),
  ballStatuses: StrilaBallStatuses,
  controlSections: ControlSections,
  messages: v.array(ControlMessage),
})
export type StrilaControlProjectionDetails = v.InferOutput<typeof StrilaControlProjectionDetails>

export const StrilaControlProjection = v.object({
  ...GameControlProjection.entries,
  gameKey: v.literal('strila-v2'),
  score: StrilaContext.entries.score,
  details: StrilaControlProjectionDetails,
})
export type StrilaControlProjection = v.InferOutput<typeof StrilaControlProjection>

const AutomaticFoulReason = v.picklist([
  'third-consecutive-cue-ball-pot',
  'illegal-ball-in-hand-pot',
  'respotted-black-opening-illegal-pot',
])

const StrilaPlayerProtocolEntryBody = v.variant('commandType', [
  v.strictObject({ commandType: v.literal('frame.commence') }),
  v.strictObject({ commandType: v.literal('pot.record'), pottedBalls: PottedBalls }),
  v.strictObject({ commandType: v.literal('miss.record') }),
  v.strictObject({ commandType: v.literal('foul.commit') }),
  v.strictObject({ commandType: v.literal('penalty.select'), choice: FoulResponseChoice }),
  v.strictObject({ commandType: v.literal('frame.award') }),
])

const StrilaSystemProtocolEntryBody = v.variant('systemType', [
  v.strictObject({ systemType: v.literal('automatic-foul'), reason: AutomaticFoulReason }),
  v.strictObject({ systemType: v.literal('winner-determined'), reason: WinnerDeterminationReason }),
  v.strictObject({ systemType: v.literal('respotted-black-declared') }),
])

export const StrilaProtocolEntry = v.object({
  ...GameProtocolEntry.entries,
  body: v.union([StrilaPlayerProtocolEntryBody, StrilaSystemProtocolEntryBody]),
})
export type StrilaProtocolEntry = v.InferOutput<typeof StrilaProtocolEntry>
