import { BySeatNumberSchema } from '@ks/core'
import { z } from 'zod'

import {
  GameCommandPresetSchema,
  GameControlProjectionSchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
} from '../abstract-runtime'

// First-pass Strila draft.
//
// This file is intentionally a lightweight TypeScript model to iterate on before
// building the reducer and before wiring anything into the package public API.

export const STRILA_COLORED_BALLS = [1, 2, 3, 4, 5, 6, 7] as const

export const StrilaSeatSchema = z.enum(['A', 'B'])
export type StrilaSeat = z.infer<typeof StrilaSeatSchema>

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

export const StrilaBallSchema = z.union([z.literal(0), StrilaColoredBallSchema])
export type StrilaBall = z.infer<typeof StrilaBallSchema>

export const StrilaScoreSchema = z.object({
  A: z.number().int().nonnegative(),
  B: z.number().int().nonnegative(),
})
export type StrilaScore = z.infer<typeof StrilaScoreSchema>

export const StrilaWinnerDeterminedReasonSchema = z.enum([
  'target-reached',
  'respotted-black-won',
  'conceded',
  'automatic-foul',
])

export const StrilaPhaseTypeSchema = z.enum([
  'not-started',
  'open-play',
  'penalty-selection',
  'ball-in-hand',
  'respotted-black-opening',
  'respotted-black-play',
  'winner-determined',
  'frame-over',
])

export const StrilaPhaseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('not-started') }),
  z.object({
    type: z.literal('open-play'),
    actor: StrilaSeatSchema,
    cueBallPotsInRun: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  }),
  z.object({
    type: z.literal('penalty-selection'),
    chooser: StrilaSeatSchema,
    offender: StrilaSeatSchema,
    forcedBallInHand: z.boolean(),
  }),
  z.object({
    type: z.literal('ball-in-hand'),
    actor: StrilaSeatSchema,
  }),
  z.object({
    type: z.literal('respotted-black-opening'),
    actor: StrilaSeatSchema,
  }),
  z.object({
    type: z.literal('respotted-black-play'),
    actor: StrilaSeatSchema,
  }),
  z.object({
    type: z.literal('winner-determined'),
    winner: StrilaSeatSchema,
    actor: StrilaSeatSchema,
    reason: StrilaWinnerDeterminedReasonSchema,
  }),
  z.object({
    type: z.literal('frame-over'),
    winner: StrilaSeatSchema,
  }),
])
export type StrilaPhase = z.infer<typeof StrilaPhaseSchema>

// Current rule-model decision:
// - cue-ball pots from ordinary play do not create a dedicated phase,
// - baulk / second-baulk origin is intentionally not represented in state,
// - marker/secretary visit tracking is deferred to higher-level competition mode,
// - `actor` means only the seat currently expected to log the next action,
// - after `foul.commit`, the game stays in `penalty-selection` until the
//   opponent chooses the response,
// - `respotted-black-opening` is kept separate so the control view can explain
//   the first-shot-only restriction.
export const StrilaFrameStateSchema = z.object({
  phase: StrilaPhaseSchema,
  score: StrilaScoreSchema,
  targetPointsBySeat: BySeatNumberSchema,
  coloredBallsOnTable: z.array(StrilaColoredBallSchema),
})
export type StrilaFrameState = z.infer<typeof StrilaFrameStateSchema>

// These are candidate user-intent commands for Strila, not final match-protocol
// event types. The protocol can still use a generic game command envelope later.
export const StrilaFoulResponseChoiceSchema = z.enum(['play-from-position', 'pass-position', 'ball-in-hand'])

export const StrilaCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('frame.commence'), actor: StrilaSeatSchema }),
  z.object({
    type: z.literal('pot.record'),
    actor: StrilaSeatSchema,
    pottedBalls: z
      .array(StrilaBallSchema)
      .min(1)
      .superRefine((balls, ctx) => {
        const seen = new Set<number>()

        for (const ball of balls) {
          if (seen.has(ball)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate potted ball: ${ball}`,
            })
            return
          }

          seen.add(ball)
        }
      }),
  }),
  // First-pass escape hatch for the special post-foul ball-in-hand shot.
  // Do not generalize this to ordinary open-play misses in v1.
  z.object({ type: z.literal('miss.record'), actor: StrilaSeatSchema }),
  z.object({ type: z.literal('foul.commit'), actor: StrilaSeatSchema }),
  z.object({
    type: z.literal('penalty.select'),
    actor: StrilaSeatSchema,
    choice: StrilaFoulResponseChoiceSchema,
  }),
  z.object({ type: z.literal('frame.award'), actor: StrilaSeatSchema }),
  z.object({ type: z.literal('frame.concede'), actor: StrilaSeatSchema }),
])
export type StrilaCommand = z.infer<typeof StrilaCommandSchema>

export const STRILA_PHASE_COMMANDS: Record<StrilaPhase['type'], readonly StrilaCommand['type'][]> = {
  'not-started': ['frame.commence'],
  'open-play': ['pot.record', 'foul.commit', 'frame.concede'],
  'penalty-selection': ['penalty.select'],
  'ball-in-hand': ['pot.record', 'miss.record', 'foul.commit', 'frame.concede'],
  'respotted-black-opening': ['pot.record', 'miss.record', 'foul.commit', 'frame.concede'],
  'respotted-black-play': ['pot.record', 'foul.commit', 'frame.concede'],
  'winner-determined': ['pot.record', 'frame.award', 'frame.concede'],
  'frame-over': [],
}

export function getAllowedCommandTypes(phase: StrilaPhase['type']): StrilaCommand['type'][] {
  return [...STRILA_PHASE_COMMANDS[phase]]
}

export function isCommandAllowedInPhase(commandType: StrilaCommand['type'], phase: StrilaPhase['type']): boolean {
  return STRILA_PHASE_COMMANDS[phase].includes(commandType)
}

export const StrilaActiveBallsViewSchema = z.object({
  active: z.array(StrilaColoredBallSchema),
  inactive: z.array(StrilaColoredBallSchema),
})

export const StrilaControlCommandSchema = GameCommandPresetSchema.extend({
  label: z.string().min(1),
})
export type StrilaControlCommand = z.infer<typeof StrilaControlCommandSchema>

export const StrilaControlDetailsSchema = z.object({
  phase: StrilaPhaseTypeSchema,
  actor: StrilaSeatSchema.optional(),
  situationTitle: z.string().min(1),
  situationSummary: z.string().min(1).optional(),
  activeBalls: StrilaActiveBallsViewSchema,
})

export const StrilaControlViewSchema = GameControlProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: StrilaScoreSchema,
  availableCommands: z.array(StrilaControlCommandSchema),
  details: StrilaControlDetailsSchema,
})
export type StrilaControlView = z.infer<typeof StrilaControlViewSchema>

export const StrilaScoreboardDetailsSchema = z.object({
  objectBalls: z.array(StrilaColoredBallSchema),
  ballsRemaining: z.array(StrilaColoredBallSchema),
  pointsAvailable: z.number().int().nonnegative(),
  phase: StrilaPhaseTypeSchema,
  winner: StrilaSeatSchema.optional(),
})

export const StrilaScoreboardViewSchema = GameScoreboardProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: StrilaScoreSchema,
  details: StrilaScoreboardDetailsSchema,
})
export type StrilaScoreboardView = z.infer<typeof StrilaScoreboardViewSchema>

export const StrilaSummaryViewSchema = GameSummaryProjectionSchema.extend({
  gameKey: z.literal('strila-v2'),
  score: StrilaScoreSchema,
  details: z.object({
    phase: StrilaPhaseTypeSchema,
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
  offender: StrilaSeatSchema,
  reason: StrilaAutomaticFoulReasonSchema,
})

export const StrilaWinnerDeterminedProtocolEntrySchema = z.object({
  source: z.literal('system'),
  systemType: z.literal('winner-determined'),
  winner: StrilaSeatSchema,
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
