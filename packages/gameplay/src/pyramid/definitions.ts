import { BySeatNumber, ControlSections, NonEmptyString, PositiveInteger, Seat } from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommand, FrameAwardCommand, FrameCommenceCommand } from '../command-schemas'
import { GameControlProjection } from '../constants'
import { type PyramidGameKey, PyramidRules } from './rules'

export const PyramidCommand = v.variant('type', [
  FrameCommenceCommand,
  v.pipe(
    v.strictObject({ type: v.literal('pot.record'), seat: Seat, pottedBallCount: PositiveInteger }),
    v.readonly(),
  ),
  FoulCommitCommand,
  FrameAwardCommand,
])
export type PyramidCommand = v.InferOutput<typeof PyramidCommand>

export const PyramidPhase = v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over'])
export type PyramidPhase = v.InferOutput<typeof PyramidPhase>

const PyramidContext = v.pipe(
  v.object({
    score: BySeatNumber,
    targetPoints: BySeatNumber,
    rules: PyramidRules,
    winner: v.nullable(Seat),
  }),
  v.readonly(),
)
export type PyramidContext = v.InferOutput<typeof PyramidContext>

const PyramidControlProjectionState = v.pipe(
  v.object({
    phase: PyramidPhase,
    winner: v.optional(Seat),
  }),
  v.readonly(),
)
type PyramidControlProjectionState = v.InferOutput<typeof PyramidControlProjectionState>

const PyramidControlProjectionDetails = v.pipe(
  v.object({
    ...PyramidControlProjectionState.entries,
    situationTitle: NonEmptyString,
    situationSummary: NonEmptyString,
    isPotCommandAvailable: v.boolean(),
    controlSections: ControlSections,
  }),
  v.readonly(),
)
type PyramidControlProjectionDetails = v.InferOutput<typeof PyramidControlProjectionDetails>

function controlProjection<K extends PyramidGameKey>(gameKey: K) {
  return v.pipe(
    v.object({
      ...GameControlProjection.entries,
      gameKey: v.literal(gameKey),
      details: PyramidControlProjectionDetails,
    }),
    v.readonly(),
  )
}

export const FreePyramidControlProjection = controlProjection('free-pyramid')
export type FreePyramidControlProjection = v.InferOutput<typeof FreePyramidControlProjection>

export const CombinedPyramidControlProjection = controlProjection('combined-pyramid')
export type CombinedPyramidControlProjection = v.InferOutput<typeof CombinedPyramidControlProjection>

export const CombinedPyramidOldControlProjection = controlProjection('combined-pyramid-old')
export type CombinedPyramidOldControlProjection = v.InferOutput<typeof CombinedPyramidOldControlProjection>

export type AnyPyramidControlProjection = Omit<FreePyramidControlProjection, 'gameKey'> & {
  readonly gameKey: PyramidGameKey
}

export type PyramidControlProjectionFor<K extends PyramidGameKey> = Omit<
  FreePyramidControlProjection,
  'gameKey'
> & {
  readonly gameKey: K
}
