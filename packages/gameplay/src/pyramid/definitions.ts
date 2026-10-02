import { BySeatNumber, NonEmptyString, PositiveInteger, Seat, StrictStruct } from '@ks/core'
import { Schema } from 'effect'

import { FoulCommitCommand, FrameAwardCommand, FrameCommenceCommand, GamePresentation } from '../constants'
import { type PyramidGameKey, PyramidRules } from './rules'

type PyramidGameKey = typeof PyramidGameKey.Type

export const PyramidCommand = Schema.Union([
  FrameCommenceCommand,
  StrictStruct({ type: Schema.Literal('pot.record'), seat: Seat, pottedBallCount: PositiveInteger }),
  FoulCommitCommand,
  FrameAwardCommand,
])

export const PyramidPhase = Schema.Literals(['not-started', 'open-play', 'winner-determined', 'frame-over'])

export const PyramidContext = Schema.Struct({
  score: BySeatNumber,
  targetPoints: BySeatNumber,
  rules: PyramidRules,
  winner: Schema.NullOr(Seat),
})

export const PyramidCheckpoint = Schema.Struct({ value: PyramidPhase, context: PyramidContext })

const PyramidGamePresentationState = Schema.Struct({
  phase: PyramidPhase,
  winner: Schema.optional(Seat),
})

const PyramidGamePresentationDetails = Schema.Struct({
  ...PyramidGamePresentationState.fields,
  situationTitle: NonEmptyString,
  situationSummary: NonEmptyString,
  isPotCommandAvailable: Schema.Boolean,
})

function gamePresentation<K extends PyramidGameKey>(gameKey: K) {
  return Schema.Struct({
    ...GamePresentation.fields,
    gameKey: Schema.Literal(gameKey),
    details: PyramidGamePresentationDetails,
  })
}

export const FreePyramidGamePresentation = gamePresentation('free-pyramid')

export const CombinedPyramidGamePresentation = gamePresentation('combined-pyramid')

export const CombinedPyramidOldGamePresentation = gamePresentation('combined-pyramid-old')

export type AnyPyramidGamePresentation = Omit<typeof FreePyramidGamePresentation.Type, 'gameKey'> & {
  readonly gameKey: PyramidGameKey
}

export type PyramidGamePresentationFor<K extends PyramidGameKey> = Omit<
  typeof FreePyramidGamePresentation.Type,
  'gameKey'
> & {
  readonly gameKey: K
}
