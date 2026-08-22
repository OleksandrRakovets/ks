import { BySeatNumberSchema, ControlCommandSectionsSchema, IntegerSchema, NonEmptyStringSchema, SeatSchema } from '@ks/core'
import * as v from 'valibot'

import { GameControlProjectionSchema, GameScoreboardProjectionSchema, GameSummaryProjectionSchema } from '../constants'
import { type PyramidGameKey, PyramidRulesSchema } from './rules'

export const PyramidCommandSchema = v.variant('type', [
  v.object({ type: v.literal('frame.commence'), seat: SeatSchema }),
  v.object({ type: v.literal('pot.record'), seat: SeatSchema, points: IntegerSchema }),
  v.object({ type: v.literal('foul.commit'), seat: SeatSchema }),
  v.object({ type: v.literal('frame.award'), seat: SeatSchema }),
])
export type PyramidCommand = v.InferOutput<typeof PyramidCommandSchema>

export const PyramidPhaseSchema = v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over'])
export type PyramidPhase = v.InferOutput<typeof PyramidPhaseSchema>

export const PyramidContextSchema = v.object({
  score: BySeatNumberSchema,
  targetPoints: BySeatNumberSchema,
  rules: PyramidRulesSchema,
  winner: v.nullable(SeatSchema),
})
export type PyramidContext = v.InferOutput<typeof PyramidContextSchema>

export const PyramidFrameStateSchema = v.object({
  pointsBySeat: BySeatNumberSchema,
  targetPointsBySeat: BySeatNumberSchema,
  phase: PyramidPhaseSchema,
  winner: v.nullable(SeatSchema),
})
export type PyramidFrameState = v.InferOutput<typeof PyramidFrameStateSchema>

const PyramidProjectionDetailsSchema = v.object({
  phase: PyramidPhaseSchema,
  winner: v.optional(SeatSchema),
})

const PyramidControlDetailsSchema = v.object({
  ...PyramidProjectionDetailsSchema.entries,
  situationTitle: NonEmptyStringSchema,
  situationSummary: NonEmptyStringSchema,
  isPotCommandAvailable: v.boolean(),
  commandSections: ControlCommandSectionsSchema,
})

function controlViewSchema<K extends PyramidGameKey>(gameKey: K) {
  return v.object({ ...GameControlProjectionSchema.entries, gameKey: v.literal(gameKey), details: PyramidControlDetailsSchema })
}

function scoreboardViewSchema<K extends PyramidGameKey>(gameKey: K) {
  return v.object({
    ...GameScoreboardProjectionSchema.entries,
    gameKey: v.literal(gameKey),
    details: PyramidProjectionDetailsSchema,
  })
}

function summaryViewSchema<K extends PyramidGameKey>(gameKey: K) {
  return v.object({
    ...GameSummaryProjectionSchema.entries,
    gameKey: v.literal(gameKey),
    details: PyramidProjectionDetailsSchema,
  })
}

export const FreePyramidControlViewSchema = controlViewSchema('free-pyramid')
export const FreePyramidScoreboardViewSchema = scoreboardViewSchema('free-pyramid')
export const FreePyramidSummaryViewSchema = summaryViewSchema('free-pyramid')
export type FreePyramidControlView = v.InferOutput<typeof FreePyramidControlViewSchema>
export type FreePyramidScoreboardView = v.InferOutput<typeof FreePyramidScoreboardViewSchema>
export type FreePyramidSummaryView = v.InferOutput<typeof FreePyramidSummaryViewSchema>

export const CombinedPyramidControlViewSchema = controlViewSchema('combined-pyramid')
export const CombinedPyramidScoreboardViewSchema = scoreboardViewSchema('combined-pyramid')
export const CombinedPyramidSummaryViewSchema = summaryViewSchema('combined-pyramid')
export type CombinedPyramidControlView = v.InferOutput<typeof CombinedPyramidControlViewSchema>
export type CombinedPyramidScoreboardView = v.InferOutput<typeof CombinedPyramidScoreboardViewSchema>
export type CombinedPyramidSummaryView = v.InferOutput<typeof CombinedPyramidSummaryViewSchema>

export const CombinedPyramidOldControlViewSchema = controlViewSchema('combined-pyramid-old')
export const CombinedPyramidOldScoreboardViewSchema = scoreboardViewSchema('combined-pyramid-old')
export const CombinedPyramidOldSummaryViewSchema = summaryViewSchema('combined-pyramid-old')
export type CombinedPyramidOldControlView = v.InferOutput<typeof CombinedPyramidOldControlViewSchema>
export type CombinedPyramidOldScoreboardView = v.InferOutput<typeof CombinedPyramidOldScoreboardViewSchema>
export type CombinedPyramidOldSummaryView = v.InferOutput<typeof CombinedPyramidOldSummaryViewSchema>

export type AnyPyramidControlView = Omit<FreePyramidControlView, 'gameKey'> & { gameKey: PyramidGameKey }
export type AnyPyramidScoreboardView = Omit<FreePyramidScoreboardView, 'gameKey'> & { gameKey: PyramidGameKey }
export type AnyPyramidSummaryView = Omit<FreePyramidSummaryView, 'gameKey'> & { gameKey: PyramidGameKey }

export type PyramidControlViewFor<K extends PyramidGameKey> = Omit<FreePyramidControlView, 'gameKey'> & { gameKey: K }
export type PyramidScoreboardViewFor<K extends PyramidGameKey> = Omit<FreePyramidScoreboardView, 'gameKey'> & { gameKey: K }
export type PyramidSummaryViewFor<K extends PyramidGameKey> = Omit<FreePyramidSummaryView, 'gameKey'> & { gameKey: K }
