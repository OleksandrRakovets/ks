import { BySeatNumber, ControlSections, NonEmptyString, PositiveInteger, Seat } from '@ks/core'
import * as v from 'valibot'

import {
  FoulCommitCommandSchema,
  FrameAwardCommandSchema,
  FrameCommenceCommandSchema,
} from '../command-schemas'
import { GameControlProjectionSchema } from '../constants'
import { type PyramidGameKey, PyramidRulesSchema } from './rules'

export const PyramidCommandSchema = v.variant('type', [
  FrameCommenceCommandSchema,
  v.strictObject({ type: v.literal('pot.record'), seat: Seat, pottedBallCount: PositiveInteger }),
  FoulCommitCommandSchema,
  FrameAwardCommandSchema,
])
export type PyramidCommand = v.InferOutput<typeof PyramidCommandSchema>

export const PyramidPhaseSchema = v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over'])
export type PyramidPhase = v.InferOutput<typeof PyramidPhaseSchema>

const PyramidContextSchema = v.object({
  score: BySeatNumber,
  targetPoints: BySeatNumber,
  rules: PyramidRulesSchema,
  winner: v.nullable(Seat),
})
export type PyramidContext = v.InferOutput<typeof PyramidContextSchema>

const PyramidControlProjectionStateSchema = v.object({
  phase: PyramidPhaseSchema,
  winner: v.optional(Seat),
})

const PyramidControlProjectionDetailsSchema = v.object({
  ...PyramidControlProjectionStateSchema.entries,
  situationTitle: NonEmptyString,
  situationSummary: NonEmptyString,
  isPotCommandAvailable: v.boolean(),
  controlSections: ControlSections,
})

function controlProjectionSchema<K extends PyramidGameKey>(gameKey: K) {
  return v.object({
    ...GameControlProjectionSchema.entries,
    gameKey: v.literal(gameKey),
    details: PyramidControlProjectionDetailsSchema,
  })
}

export const FreePyramidControlProjectionSchema = controlProjectionSchema('free-pyramid')
export type FreePyramidControlProjection = v.InferOutput<typeof FreePyramidControlProjectionSchema>

export const CombinedPyramidControlProjectionSchema = controlProjectionSchema('combined-pyramid')
export type CombinedPyramidControlProjection = v.InferOutput<typeof CombinedPyramidControlProjectionSchema>

export const CombinedPyramidOldControlProjectionSchema = controlProjectionSchema('combined-pyramid-old')
export type CombinedPyramidOldControlProjection = v.InferOutput<
  typeof CombinedPyramidOldControlProjectionSchema
>

export type AnyPyramidControlProjection = Omit<FreePyramidControlProjection, 'gameKey'> & {
  gameKey: PyramidGameKey
}

export type PyramidControlProjectionFor<K extends PyramidGameKey> = Omit<
  FreePyramidControlProjection,
  'gameKey'
> & {
  gameKey: K
}
