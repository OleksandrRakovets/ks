import { BySeatNumber, NonEmptyString, PositiveInteger, Seat } from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommand, FrameAwardCommand, FrameCommenceCommand, GamePresentation } from '../constants'
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

export const PyramidContext = v.pipe(
  v.object({
    score: BySeatNumber,
    targetPoints: BySeatNumber,
    rules: PyramidRules,
    winner: v.nullable(Seat),
  }),
  v.readonly(),
)

export type PyramidContext = v.InferOutput<typeof PyramidContext>

export const PyramidCheckpoint = v.object({ value: PyramidPhase, context: PyramidContext })

export type PyramidCheckpoint = v.InferOutput<typeof PyramidCheckpoint>

const PyramidGamePresentationState = v.pipe(
  v.object({
    phase: PyramidPhase,
    winner: v.optional(Seat),
  }),
  v.readonly(),
)

type PyramidGamePresentationState = v.InferOutput<typeof PyramidGamePresentationState>

const PyramidGamePresentationDetails = v.pipe(
  v.object({
    ...PyramidGamePresentationState.entries,
    situationTitle: NonEmptyString,
    situationSummary: NonEmptyString,
    isPotCommandAvailable: v.boolean(),
  }),
  v.readonly(),
)

type PyramidGamePresentationDetails = v.InferOutput<typeof PyramidGamePresentationDetails>

function gamePresentation<K extends PyramidGameKey>(gameKey: K) {
  return v.pipe(
    v.object({
      ...GamePresentation.entries,
      gameKey: v.literal(gameKey),
      details: PyramidGamePresentationDetails,
    }),
    v.readonly(),
  )
}

export const FreePyramidGamePresentation = gamePresentation('free-pyramid')

export type FreePyramidGamePresentation = v.InferOutput<typeof FreePyramidGamePresentation>

export const CombinedPyramidGamePresentation = gamePresentation('combined-pyramid')

export type CombinedPyramidGamePresentation = v.InferOutput<typeof CombinedPyramidGamePresentation>

export const CombinedPyramidOldGamePresentation = gamePresentation('combined-pyramid-old')

export type CombinedPyramidOldGamePresentation = v.InferOutput<typeof CombinedPyramidOldGamePresentation>

export type AnyPyramidGamePresentation = Omit<FreePyramidGamePresentation, 'gameKey'> & {
  readonly gameKey: PyramidGameKey
}

export type PyramidGamePresentationFor<K extends PyramidGameKey> = Omit<
  FreePyramidGamePresentation,
  'gameKey'
> & {
  readonly gameKey: K
}
