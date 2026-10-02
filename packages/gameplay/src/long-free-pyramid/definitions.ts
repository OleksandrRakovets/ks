import { BySeatNumber, Integer, Seat, StrictStruct } from '@ks/core'
import { Schema } from 'effect'

import {
  FoulCommitCommand,
  FrameAwardCommand,
  FrameCommenceCommand,
  GamePresentation,
  LongFreePyramidRack,
} from '../constants'

export { LongFreePyramidRack } from '../constants'

const LongFreePyramidPottedBallCount = Schema.Literals([1, 2, 3, 4])

export const LongFreePyramidCommand = Schema.Union([
  FrameCommenceCommand,
  StrictStruct({
    type: Schema.Literal('pot.record'),
    seat: Seat,
    pottedBallCount: LongFreePyramidPottedBallCount,
  }),
  FoulCommitCommand,
  FrameAwardCommand,
])

const LongFreePyramidMessage = Schema.Struct({
  code: Schema.Literal('rack-started'),
  rackNumber: Integer.check(Schema.isGreaterThanOrEqualTo(1)),
})

export const LongFreePyramidPhase = Schema.Literals([
  'not-started',
  'open-play',
  'winner-determined',
  'awaiting-award',
  'frame-over',
])

export const LongFreePyramidContext = Schema.Struct({
  racks: Schema.Array(LongFreePyramidRack).check(Schema.isMinLength(1)),
  targetPoints: BySeatNumber,
  rackRollover: Schema.Literals([14, 15]),
  winner: Schema.NullOr(Seat),
  messages: Schema.Array(LongFreePyramidMessage),
})

export const LongFreePyramidCheckpoint = Schema.Struct({
  value: LongFreePyramidPhase,
  context: LongFreePyramidContext,
})

export const LongFreePyramidGamePresentationState = Schema.Struct({
  phase: LongFreePyramidPhase,
  winner: Schema.optional(Seat),
  rackHistory: Schema.Array(LongFreePyramidRack).check(Schema.isMinLength(1)),
  currentRack: LongFreePyramidRack,
  rackRollover: Schema.Literals([14, 15]),
  ballsRemoved: Integer.check(Schema.isGreaterThanOrEqualTo(0)),
  ballsOnTable: Integer.check(Schema.isGreaterThanOrEqualTo(0)),
  messages: Schema.Array(LongFreePyramidMessage),
})

const LongFreePyramidGamePresentationDetails = Schema.Struct({
  ...LongFreePyramidGamePresentationState.fields,
  isPotCommandAvailable: Schema.Boolean,
})

export const LongFreePyramidGamePresentation = Schema.Struct({
  ...GamePresentation.fields,
  gameKey: Schema.Literal('free-pyramid-long'),
  details: LongFreePyramidGamePresentationDetails,
})
