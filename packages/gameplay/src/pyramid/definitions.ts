import { BySeatNumber, ControlSections, NonEmptyString, PositiveInteger, Seat } from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommand, FrameAwardCommand, FrameCommenceCommand } from '../command-schemas'
import { GameControlProjection } from '../constants'
import { type PyramidGameKey, PyramidRules } from './rules'

export const PyramidCommand = v.variant('type', [
  FrameCommenceCommand,
  v.strictObject({ type: v.literal('pot.record'), seat: Seat, pottedBallCount: PositiveInteger }),
  FoulCommitCommand,
  FrameAwardCommand,
])
export type PyramidCommand = v.InferOutput<typeof PyramidCommand>

export const PyramidPhase = v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over'])
export type PyramidPhase = v.InferOutput<typeof PyramidPhase>

const PyramidContext = v.object({
  score: BySeatNumber,
  targetPoints: BySeatNumber,
  rules: PyramidRules,
  winner: v.nullable(Seat),
})
export type PyramidContext = v.InferOutput<typeof PyramidContext>

const PyramidControlProjectionState = v.object({
  phase: PyramidPhase,
  winner: v.optional(Seat),
})

const PyramidControlProjectionDetails = v.object({
  ...PyramidControlProjectionState.entries,
  situationTitle: NonEmptyString,
  situationSummary: NonEmptyString,
  isPotCommandAvailable: v.boolean(),
  controlSections: ControlSections,
})

function controlProjectionSchema<K extends PyramidGameKey>(gameKey: K) {
  return v.object({
    ...GameControlProjection.entries,
    gameKey: v.literal(gameKey),
    details: PyramidControlProjectionDetails,
  })
}

export const FreePyramidControlProjection = controlProjectionSchema('free-pyramid')
export type FreePyramidControlProjection = v.InferOutput<typeof FreePyramidControlProjection>

export const CombinedPyramidControlProjection = controlProjectionSchema('combined-pyramid')
export type CombinedPyramidControlProjection = v.InferOutput<typeof CombinedPyramidControlProjection>

export const CombinedPyramidOldControlProjection = controlProjectionSchema('combined-pyramid-old')
export type CombinedPyramidOldControlProjection = v.InferOutput<typeof CombinedPyramidOldControlProjection>

export type AnyPyramidControlProjection = Omit<FreePyramidControlProjection, 'gameKey'> & {
  gameKey: PyramidGameKey
}

export type PyramidControlProjectionFor<K extends PyramidGameKey> = Omit<
  FreePyramidControlProjection,
  'gameKey'
> & {
  gameKey: K
}
