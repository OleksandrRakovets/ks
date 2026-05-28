import { BySeatNumberSchema, ControlCommandSectionsSchema, ProtocolEntrySchema, SeatSchema } from '@ks/core'
import { z } from 'zod'

import {
  GameCommandPresetSchema,
  GameControlProjectionSchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
} from '../constants'

const CueBallSchema = z.literal(0)
const ColoredBallSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
])
export type StrilaColoredBall = z.infer<typeof ColoredBallSchema>
const COLORED_BALLS: readonly StrilaColoredBall[] = [1, 2, 3, 4, 5, 6, 7]

const BallSchema = z.union([CueBallSchema, ColoredBallSchema])
export type StrilaBall = z.infer<typeof BallSchema>
const BALLS: readonly StrilaBall[] = [0, ...COLORED_BALLS]

const PottedBallsSchema = z
  .array(BallSchema)
  .min(1)
  .refine((balls) => new Set(balls).size === balls.length, 'Potted balls must be unique')

export const StrilaMeta = {
  allBalls: BALLS,
  coloredBalls: COLORED_BALLS,
  cueBall: CueBallSchema.value,
  defaultTargetPoints: { A: 9, B: 9 },
}

const FoulResponseChoiceSchema = z.enum(['play-from-position', 'pass-position', 'ball-in-hand'])

export const StrilaCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('frame.commence'), seat: SeatSchema }),
  z.object({ type: z.literal('pot.record'), seat: SeatSchema, pottedBalls: PottedBallsSchema }),
  z.object({ type: z.literal('miss.record'), seat: SeatSchema }),
  z.object({ type: z.literal('foul.commit'), seat: SeatSchema }),
  z.object({ type: z.literal('penalty.select'), seat: SeatSchema, choice: FoulResponseChoiceSchema }),
  z.object({ type: z.literal('frame.award'), seat: SeatSchema }),
])
export type StrilaCommand = z.infer<typeof StrilaCommandSchema>

export const StrilaPhaseSchema = z.enum([
  'not-started',
  'open-play',
  'foul-committed.penalty-selection',
  'foul-committed.ball-in-hand',
  'respotted-black.opening',
  'respotted-black.play',
  'winner-determined',
  'frame-over',
])
export type StrilaPhase = z.infer<typeof StrilaPhaseSchema>

const WinnerDeterminedReasonSchema = z.enum(['target-reached', 'respotted-black-won', 'automatic-foul'])
export type StrilaWinReason = z.infer<typeof WinnerDeterminedReasonSchema>

const ContextSchema = z.object({
  score: BySeatNumberSchema,
  targetPoints: BySeatNumberSchema,
  coloredBallsOnTable: z.array(ColoredBallSchema),
  cueBallSerialPots: z
    .object({
      seat: SeatSchema,
      count: z.union([z.literal(1), z.literal(2)]),
    })
    .nullable(),
  foulOffender: SeatSchema.nullable(),
  winner: SeatSchema.nullable(),
  winReason: WinnerDeterminedReasonSchema.nullable(),
})
export type StrilaContext = z.infer<typeof ContextSchema>

export const StrilaFrameStateSchema = ContextSchema.extend({
  phase: StrilaPhaseSchema,
})
export type StrilaFrameState = z.infer<typeof StrilaFrameStateSchema>

const BallStatusSchema = z.enum(['object', 'on-table', 'potted'])
export const StrilaBallStatusesSchema = z.object({
  0: BallStatusSchema,
  1: BallStatusSchema,
  2: BallStatusSchema,
  3: BallStatusSchema,
  4: BallStatusSchema,
  5: BallStatusSchema,
  6: BallStatusSchema,
  7: BallStatusSchema,
})

const ControlMessageSchema = z.object({
  type: z.enum(['hint', 'warning']),
  text: z.string().min(1),
})

const ControlCommandSchema = GameCommandPresetSchema.extend({
  label: z.string().min(1),
})
export type StrilaControlCommand = z.infer<typeof ControlCommandSchema>

export const StrilaControlDetailsSchema = z.object({
  phase: StrilaPhaseSchema,
  seat: SeatSchema.optional(),
  situationTitle: z.string().min(1),
  situationSummary: z.string().min(1).optional(),
  isPotCommandAvailable: z.boolean(),
  ballStatuses: StrilaBallStatusesSchema,
  commandSections: ControlCommandSectionsSchema,
  messages: z.array(ControlMessageSchema),
})
export type StrilaControlDetails = z.infer<typeof StrilaControlDetailsSchema>

export const StrilaControlViewSchema = GameControlProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: ContextSchema.shape.score,
  details: StrilaControlDetailsSchema,
})
export type StrilaControlView = z.infer<typeof StrilaControlViewSchema>

const ScoreboardDetailsSchema = z.object({
  objectBalls: z.array(ColoredBallSchema),
  ballsRemaining: z.array(ColoredBallSchema),
  pointsAvailable: z.number().int().nonnegative(),
  phase: StrilaPhaseSchema,
  winner: SeatSchema.optional(),
})

export const StrilaScoreboardViewSchema = GameScoreboardProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: ContextSchema.shape.score,
  details: ScoreboardDetailsSchema,
})
export type StrilaScoreboardView = z.infer<typeof StrilaScoreboardViewSchema>

export const StrilaSummaryViewSchema = GameSummaryProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: ContextSchema.shape.score,
  details: z.object({
    phase: StrilaPhaseSchema,
  }),
})

const AutomaticFoulReasonSchema = z.enum([
  'third-consecutive-cue-ball-pot',
  'illegal-ball-in-hand-pot',
  'respotted-black-opening-illegal-pot',
])

const StrilaPlayerProtocolEntryBodySchema = z.discriminatedUnion('commandType', [
  z.object({ commandType: z.literal('frame.commence') }),
  z.object({ commandType: z.literal('pot.record'), pottedBalls: PottedBallsSchema }),
  z.object({ commandType: z.literal('miss.record') }),
  z.object({ commandType: z.literal('foul.commit') }),
  z.object({ commandType: z.literal('penalty.select'), choice: FoulResponseChoiceSchema }),
  z.object({ commandType: z.literal('frame.award') }),
])

const StrilaSystemProtocolEntryBodySchema = z.discriminatedUnion('systemType', [
  z.object({ systemType: z.literal('automatic-foul'), reason: AutomaticFoulReasonSchema }),
  z.object({ systemType: z.literal('winner-determined'), reason: WinnerDeterminedReasonSchema }),
  z.object({ systemType: z.literal('respotted-black-declared') }),
])

export const StrilaProtocolEntrySchema = ProtocolEntrySchema.extend({
  body: z.union([StrilaPlayerProtocolEntryBodySchema, StrilaSystemProtocolEntryBodySchema]),
})
export type StrilaProtocolEntry = z.infer<typeof StrilaProtocolEntrySchema>
