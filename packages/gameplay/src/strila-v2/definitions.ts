import { BySeatNumberSchema, SeatSchema } from '@ks/core'
import { z } from 'zod'

import {
  GameCommandPresetSchema,
  GameControlProjectionSchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
} from '../abstract-runtime'

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

export const StrilaEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('frame.commence'), actor: SeatSchema }),
  z.object({ type: z.literal('pot.record'), actor: SeatSchema, pottedBalls: PottedBallsSchema }),
  z.object({ type: z.literal('miss.record'), actor: SeatSchema }),
  z.object({ type: z.literal('foul.commit'), actor: SeatSchema }),
  z.object({ type: z.literal('penalty.select'), actor: SeatSchema, choice: FoulResponseChoiceSchema }),
  z.object({ type: z.literal('frame.award'), actor: SeatSchema }),
  z.object({ type: z.literal('frame.concede'), actor: SeatSchema }),
])
export type StrilaEvent = z.infer<typeof StrilaEventSchema>
export const StrilaCommandSchema = StrilaEventSchema
export type StrilaCommand = StrilaEvent

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

const WinnerDeterminedReasonSchema = z.enum(['target-reached', 'respotted-black-won', 'conceded', 'automatic-foul'])
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

const CommandSectionBySeatSchema = z.object({
  A: z.array(ControlCommandSchema),
  B: z.array(ControlCommandSchema),
})

const CommandSectionsSchema = z.object({
  primary: CommandSectionBySeatSchema,
  secondary: CommandSectionBySeatSchema,
  tertiary: CommandSectionBySeatSchema,
})

export const StrilaControlDetailsSchema = z.object({
  phase: StrilaPhaseSchema,
  actor: SeatSchema.optional(),
  situationTitle: z.string().min(1),
  situationSummary: z.string().min(1).optional(),
  isPotCommandAvailable: z.boolean(),
  ballStatuses: StrilaBallStatusesSchema,
  commandSections: CommandSectionsSchema,
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

const PlayerProtocolEntrySchema = z.object({
  source: z.literal('player'),
  command: StrilaCommandSchema,
})

const AutomaticFoulProtocolEntrySchema = z.object({
  source: z.literal('system'),
  systemType: z.literal('automatic-foul'),
  offender: SeatSchema,
  reason: AutomaticFoulReasonSchema,
})

const WinnerDeterminedProtocolEntrySchema = z.object({
  source: z.literal('system'),
  systemType: z.literal('winner-determined'),
  winner: SeatSchema,
  reason: WinnerDeterminedReasonSchema,
})

const RespottedBlackDeclaredProtocolEntrySchema = z.object({
  source: z.literal('system'),
  systemType: z.literal('respotted-black-declared'),
})

export const StrilaProtocolEntrySchema = z.union([
  PlayerProtocolEntrySchema,
  AutomaticFoulProtocolEntrySchema,
  WinnerDeterminedProtocolEntrySchema,
  RespottedBlackDeclaredProtocolEntrySchema,
])
export type StrilaProtocolEntry = z.infer<typeof StrilaProtocolEntrySchema>
