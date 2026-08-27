import { BySeatNumberSchema, ControlSections, NonEmptyStringSchema, PositiveIntegerSchema, SeatSchema } from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommandSchema, FrameAwardCommandSchema, FrameCommenceCommandSchema } from '../command-schemas'
import { GameControlProjectionSchema } from '../constants'
import { type PyramidGameKey, PyramidRulesSchema } from './rules'

export const PyramidCommandSchema = v.variant('type', [
  FrameCommenceCommandSchema,
  v.strictObject({ type: v.literal('pot.record'), seat: SeatSchema, pottedBallCount: PositiveIntegerSchema }),
  FoulCommitCommandSchema,
  FrameAwardCommandSchema,
])
export type PyramidCommand = v.InferOutput<typeof PyramidCommandSchema>

export const PyramidPhaseSchema = v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over'])
export type PyramidPhase = v.InferOutput<typeof PyramidPhaseSchema>

const PyramidContextSchema = v.object({
  score: BySeatNumberSchema,
  targetPoints: BySeatNumberSchema,
  rules: PyramidRulesSchema,
  winner: v.nullable(SeatSchema),
})
export type PyramidContext = v.InferOutput<typeof PyramidContextSchema>

const PyramidProjectionDetailsSchema = v.object({
  phase: PyramidPhaseSchema,
  winner: v.optional(SeatSchema),
})

const PyramidControlDetailsSchema = v.object({
  ...PyramidProjectionDetailsSchema.entries,
  situationTitle: NonEmptyStringSchema,
  situationSummary: NonEmptyStringSchema,
  isPotCommandAvailable: v.boolean(),
  controlSections: ControlSections,
})

function controlViewSchema<K extends PyramidGameKey>(gameKey: K) {
  return v.object({ ...GameControlProjectionSchema.entries, gameKey: v.literal(gameKey), details: PyramidControlDetailsSchema })
}

export const FreePyramidControlViewSchema = controlViewSchema('free-pyramid')
export type FreePyramidControlView = v.InferOutput<typeof FreePyramidControlViewSchema>

export const CombinedPyramidControlViewSchema = controlViewSchema('combined-pyramid')
export type CombinedPyramidControlView = v.InferOutput<typeof CombinedPyramidControlViewSchema>

export const CombinedPyramidOldControlViewSchema = controlViewSchema('combined-pyramid-old')
export type CombinedPyramidOldControlView = v.InferOutput<typeof CombinedPyramidOldControlViewSchema>

export type AnyPyramidControlView = Omit<FreePyramidControlView, 'gameKey'> & { gameKey: PyramidGameKey }

export type PyramidControlViewFor<K extends PyramidGameKey> = Omit<FreePyramidControlView, 'gameKey'> & { gameKey: K }
