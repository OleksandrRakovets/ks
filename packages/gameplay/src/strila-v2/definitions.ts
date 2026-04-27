import { BySeatNumberSchema, SeatSchema } from '@ks/core'
import { z } from 'zod'

import {
  GameCommandPresetSchema,
  GameControlProjectionSchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
} from '../abstract-runtime'

export const StrilaColoredBallSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
])
export type StrilaColoredBall = z.infer<typeof StrilaColoredBallSchema>
export const STRILA_COLORED_BALLS: readonly StrilaColoredBall[] = [1, 2, 3, 4, 5, 6, 7]

export const StrilaBallSchema = z.union([z.literal(0), StrilaColoredBallSchema])
export type StrilaBall = z.infer<typeof StrilaBallSchema>
export const STRILA_BALLS: readonly StrilaBall[] = [0, ...STRILA_COLORED_BALLS]

export const StrilaFoulResponseChoiceSchema = z.enum(['play-from-position', 'pass-position', 'ball-in-hand'])

export const StrilaEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('frame.commence'), actor: SeatSchema }),
  z.object({ type: z.literal('pot.record'), actor: SeatSchema, pottedBalls: z.array(StrilaBallSchema) }),
  z.object({ type: z.literal('miss.record'), actor: SeatSchema }),
  z.object({ type: z.literal('foul.commit'), actor: SeatSchema }),
  z.object({ type: z.literal('penalty.select'), actor: SeatSchema, choice: StrilaFoulResponseChoiceSchema }),
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

export const StrilaWinnerDeterminedReasonSchema = z.enum([
  'target-reached',
  'respotted-black-won',
  'conceded',
  'automatic-foul',
])
export type StrilaWinReason = z.infer<typeof StrilaWinnerDeterminedReasonSchema>
export const StrilaWinReasons: readonly StrilaWinReason[] = [
  'target-reached',
  'respotted-black-won',
  'conceded',
  'automatic-foul',
]

export const StrilaContextSchema = z.object({
  score: BySeatNumberSchema,
  targetPoints: BySeatNumberSchema,
  coloredBallsOnTable: z.array(StrilaColoredBallSchema),
  cueBallSerialPots: z
    .object({
      seat: SeatSchema,
      count: z.union([z.literal(1), z.literal(2)]),
    })
    .nullable(),
  foulOffender: SeatSchema.nullable(),
  winner: SeatSchema.nullable(),
  winReason: StrilaWinnerDeterminedReasonSchema.nullable(),
})
export type StrilaContext = z.infer<typeof StrilaContextSchema>

export const StrilaFrameStateSchema = StrilaContextSchema.extend({
  phase: StrilaPhaseSchema,
})
export type StrilaFrameState = z.infer<typeof StrilaFrameStateSchema>

export const STRILA_PHASE_COMMANDS: Record<StrilaPhase, readonly StrilaCommand['type'][]> = {
  'not-started': ['frame.commence'],
  'open-play': ['pot.record', 'foul.commit', 'frame.concede'],
  'foul-committed.penalty-selection': ['penalty.select'],
  'foul-committed.ball-in-hand': ['pot.record', 'miss.record', 'foul.commit', 'frame.concede'],
  'respotted-black.opening': ['pot.record', 'miss.record', 'foul.commit', 'frame.concede'],
  'respotted-black.play': ['pot.record', 'foul.commit', 'frame.concede'],
  'winner-determined': ['pot.record', 'frame.award'],
  'frame-over': [],
}

export function getAllowedCommandTypes(phase: StrilaPhase): StrilaCommand['type'][] {
  return [...STRILA_PHASE_COMMANDS[phase]]
}

export function isCommandAllowedInPhase(commandType: StrilaCommand['type'], phase: StrilaPhase): boolean {
  return STRILA_PHASE_COMMANDS[phase].includes(commandType)
}

export const StrilaBallStatusSchema = z.enum(['object', 'on-table', 'potted'])

const StrilaBallStatusesShape = {
  0: StrilaBallStatusSchema,
  1: StrilaBallStatusSchema,
  2: StrilaBallStatusSchema,
  3: StrilaBallStatusSchema,
  4: StrilaBallStatusSchema,
  5: StrilaBallStatusSchema,
  6: StrilaBallStatusSchema,
  7: StrilaBallStatusSchema,
}

export const StrilaBallStatusesSchema = z.object(StrilaBallStatusesShape)

export const StrilaControlMessageSchema = z.object({
  type: z.enum(['hint', 'warning']),
  text: z.string().min(1),
})

export const StrilaControlCommandSchema = GameCommandPresetSchema.extend({
  label: z.string().min(1),
})
export type StrilaControlCommand = z.infer<typeof StrilaControlCommandSchema>

const StrilaCommandSectionBySeatSchema = z.object({
  A: z.array(StrilaControlCommandSchema),
  B: z.array(StrilaControlCommandSchema),
})

export const StrilaCommandSectionsSchema = z.object({
  primary: StrilaCommandSectionBySeatSchema,
  secondary: StrilaCommandSectionBySeatSchema,
  tertiary: StrilaCommandSectionBySeatSchema,
})

export const StrilaControlDetailsSchema = z.object({
  phase: StrilaPhaseSchema,
  actor: SeatSchema.optional(),
  situationTitle: z.string().min(1),
  situationSummary: z.string().min(1).optional(),
  isPotCommandAvailable: z.boolean(),
  ballStatuses: StrilaBallStatusesSchema,
  commandSections: StrilaCommandSectionsSchema,
  messages: z.array(StrilaControlMessageSchema),
})
export type StrilaControlDetails = z.infer<typeof StrilaControlDetailsSchema>

export const StrilaControlViewSchema = GameControlProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: StrilaContextSchema.shape.score,
  details: StrilaControlDetailsSchema,
})
export type StrilaControlView = z.infer<typeof StrilaControlViewSchema>

export const StrilaScoreboardDetailsSchema = z.object({
  objectBalls: z.array(StrilaColoredBallSchema),
  ballsRemaining: z.array(StrilaColoredBallSchema),
  pointsAvailable: z.number().int().nonnegative(),
  phase: StrilaPhaseSchema,
  winner: SeatSchema.optional(),
})

export const StrilaScoreboardViewSchema = GameScoreboardProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: StrilaContextSchema.shape.score,
  details: StrilaScoreboardDetailsSchema,
})
export type StrilaScoreboardView = z.infer<typeof StrilaScoreboardViewSchema>

export const StrilaSummaryViewSchema = GameSummaryProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: StrilaContextSchema.shape.score,
  details: z.object({
    phase: StrilaPhaseSchema,
  }),
})

export const StrilaAutomaticFoulReasonSchema = z.enum([
  'third-consecutive-cue-ball-pot',
  'illegal-ball-in-hand-pot',
  'respotted-black-opening-illegal-pot',
])

export const StrilaPlayerProtocolEntrySchema = z.object({
  source: z.literal('player'),
  command: StrilaCommandSchema,
})

export const StrilaAutomaticFoulProtocolEntrySchema = z.object({
  source: z.literal('system'),
  systemType: z.literal('automatic-foul'),
  offender: SeatSchema,
  reason: StrilaAutomaticFoulReasonSchema,
})

export const StrilaWinnerDeterminedProtocolEntrySchema = z.object({
  source: z.literal('system'),
  systemType: z.literal('winner-determined'),
  winner: SeatSchema,
  reason: StrilaWinnerDeterminedReasonSchema,
})

export const StrilaRespottedBlackDeclaredProtocolEntrySchema = z.object({
  source: z.literal('system'),
  systemType: z.literal('respotted-black-declared'),
})

export const StrilaProtocolEntrySchema = z.union([
  StrilaPlayerProtocolEntrySchema,
  StrilaAutomaticFoulProtocolEntrySchema,
  StrilaWinnerDeterminedProtocolEntrySchema,
  StrilaRespottedBlackDeclaredProtocolEntrySchema,
])
export type StrilaProtocolEntry = z.infer<typeof StrilaProtocolEntrySchema>
