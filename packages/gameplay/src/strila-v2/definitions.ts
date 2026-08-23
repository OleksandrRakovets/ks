import {
  BySeatNumberSchema,
  ControlCommandSectionsSchema,
  NonEmptyStringSchema,
  ProtocolEntrySchema,
  SeatSchema,
} from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommandSchema, FrameAwardCommandSchema, FrameCommenceCommandSchema } from '../command-schemas'
import { GameControlCommandSchema, GameControlProjectionSchema } from '../constants'

const CueBallSchema = v.literal(0)
const ColoredBallSchema = v.union([
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6),
  v.literal(7),
])
export type StrilaColoredBall = v.InferOutput<typeof ColoredBallSchema>
const COLORED_BALLS: readonly StrilaColoredBall[] = [1, 2, 3, 4, 5, 6, 7]

const BallSchema = v.union([CueBallSchema, ColoredBallSchema])
export type StrilaBall = v.InferOutput<typeof BallSchema>
const BALLS: readonly StrilaBall[] = [0, ...COLORED_BALLS]

const PottedBallsSchema = v.pipe(
  v.array(BallSchema),
  v.minLength(1),
  v.check((balls) => new Set(balls).size === balls.length, 'Potted balls must be unique'),
)

export const StrilaMeta = {
  allBalls: BALLS,
  coloredBalls: COLORED_BALLS,
  cueBall: CueBallSchema.literal,
  defaultTargetPoints: { A: 9, B: 9 },
}

const FoulResponseChoiceSchema = v.picklist(['play-from-position', 'pass-position', 'ball-in-hand'])

export const StrilaCommandSchema = v.variant('type', [
  FrameCommenceCommandSchema,
  v.strictObject({ type: v.literal('pot.record'), seat: SeatSchema, pottedBalls: PottedBallsSchema }),
  v.strictObject({ type: v.literal('miss.record'), seat: SeatSchema }),
  FoulCommitCommandSchema,
  v.strictObject({ type: v.literal('penalty.select'), seat: SeatSchema, choice: FoulResponseChoiceSchema }),
  FrameAwardCommandSchema,
])
export type StrilaCommand = v.InferOutput<typeof StrilaCommandSchema>

export const StrilaPhaseSchema = v.picklist([
  'not-started',
  'open-play',
  'foul-committed.penalty-selection',
  'foul-committed.ball-in-hand',
  'respotted-black.opening',
  'respotted-black.play',
  'winner-determined',
  'frame-over',
])
export type StrilaPhase = v.InferOutput<typeof StrilaPhaseSchema>

const WinnerDeterminationReasonSchema = v.picklist(['target-reached', 'respotted-black-won', 'automatic-foul'])

const ContextSchema = v.object({
  score: BySeatNumberSchema,
  targetPoints: BySeatNumberSchema,
  coloredBallsOnTable: v.array(ColoredBallSchema),
  cueBallSerialPots: v.nullable(
    v.object({
      seat: SeatSchema,
      count: v.union([v.literal(1), v.literal(2)]),
    }),
  ),
  foulOffender: v.nullable(SeatSchema),
  winner: v.nullable(SeatSchema),
  winnerDeterminationReason: v.nullable(WinnerDeterminationReasonSchema),
})
export type StrilaContext = v.InferOutput<typeof ContextSchema>

const BallStatusSchema = v.picklist(['object', 'on-table', 'potted'])
export const StrilaBallStatusesSchema = v.object({
  0: BallStatusSchema,
  1: BallStatusSchema,
  2: BallStatusSchema,
  3: BallStatusSchema,
  4: BallStatusSchema,
  5: BallStatusSchema,
  6: BallStatusSchema,
  7: BallStatusSchema,
})

const ControlMessageSchema = v.object({
  type: v.picklist(['hint', 'warning']),
  code: v.picklist(['cue-ball-and-colored-is-foul', 'black-pot-wins']),
})

export type StrilaControlCommand = v.InferOutput<typeof GameControlCommandSchema>

export const StrilaControlDetailsSchema = v.object({
  phase: StrilaPhaseSchema,
  seat: v.optional(SeatSchema),
  situationTitle: NonEmptyStringSchema,
  situationSummary: v.optional(NonEmptyStringSchema),
  isPotCommandAvailable: v.boolean(),
  ballStatuses: StrilaBallStatusesSchema,
  commandSections: ControlCommandSectionsSchema,
  messages: v.array(ControlMessageSchema),
})
export type StrilaControlDetails = v.InferOutput<typeof StrilaControlDetailsSchema>

export const StrilaControlViewSchema = v.object({
  ...GameControlProjectionSchema.entries,
  gameKey: v.literal('strila-v2'),
  score: ContextSchema.entries.score,
  details: StrilaControlDetailsSchema,
})
export type StrilaControlView = v.InferOutput<typeof StrilaControlViewSchema>

const AutomaticFoulReasonSchema = v.picklist([
  'third-consecutive-cue-ball-pot',
  'illegal-ball-in-hand-pot',
  'respotted-black-opening-illegal-pot',
])

const StrilaPlayerProtocolEntryBodySchema = v.variant('commandType', [
  v.object({ commandType: v.literal('frame.commence') }),
  v.object({ commandType: v.literal('pot.record'), pottedBalls: PottedBallsSchema }),
  v.object({ commandType: v.literal('miss.record') }),
  v.object({ commandType: v.literal('foul.commit') }),
  v.object({ commandType: v.literal('penalty.select'), choice: FoulResponseChoiceSchema }),
  v.object({ commandType: v.literal('frame.award') }),
])

const StrilaSystemProtocolEntryBodySchema = v.variant('systemType', [
  v.object({ systemType: v.literal('automatic-foul'), reason: AutomaticFoulReasonSchema }),
  v.object({ systemType: v.literal('winner-determined'), reason: WinnerDeterminationReasonSchema }),
  v.object({ systemType: v.literal('respotted-black-declared') }),
])

export const StrilaProtocolEntrySchema = v.object({
  ...ProtocolEntrySchema.entries,
  body: v.union([StrilaPlayerProtocolEntryBodySchema, StrilaSystemProtocolEntryBodySchema]),
})
export type StrilaProtocolEntry = v.InferOutput<typeof StrilaProtocolEntrySchema>
