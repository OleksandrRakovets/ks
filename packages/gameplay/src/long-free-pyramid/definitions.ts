import { BySeatNumber, ControlSections, Integer, Seat } from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommand, FrameAwardCommand, FrameCommenceCommand } from '../command-schemas'
import { GameControlProjection } from '../constants'

const LongFreePyramidPottedBallCount = v.picklist([1, 2, 3, 4])

export const LongFreePyramidCommand = v.variant('type', [
  FrameCommenceCommand,
  v.strictObject({
    type: v.literal('pot.record'),
    seat: Seat,
    pottedBallCount: LongFreePyramidPottedBallCount,
  }),
  FoulCommitCommand,
  FrameAwardCommand,
])
export type LongFreePyramidCommand = v.InferOutput<typeof LongFreePyramidCommand>

const LongFreePyramidRack = v.object({
  rackNumber: v.pipe(Integer, v.minValue(1)),
  scoreBySeat: BySeatNumber,
})
export type LongFreePyramidRack = v.InferOutput<typeof LongFreePyramidRack>

const LongFreePyramidMessage = v.object({
  code: v.literal('rack-started'),
  rackNumber: v.pipe(Integer, v.minValue(1)),
})
export const LongFreePyramidPhase = v.picklist([
  'not-started',
  'open-play',
  'winner-determined',
  'awaiting-award',
  'frame-over',
])
export type LongFreePyramidPhase = v.InferOutput<typeof LongFreePyramidPhase>

const LongFreePyramidContext = v.object({
  racks: v.pipe(v.array(LongFreePyramidRack), v.minLength(1)),
  targetPoints: BySeatNumber,
  rackRollover: v.picklist([14, 15]),
  winner: v.nullable(Seat),
  messages: v.array(LongFreePyramidMessage),
})
export type LongFreePyramidContext = v.InferOutput<typeof LongFreePyramidContext>

const LongFreePyramidControlProjectionState = v.object({
  phase: LongFreePyramidPhase,
  winner: v.optional(Seat),
  rackHistory: v.pipe(v.array(LongFreePyramidRack), v.minLength(1)),
  currentRack: LongFreePyramidRack,
  ballsRemoved: v.pipe(Integer, v.minValue(0)),
  ballsOnTable: v.pipe(Integer, v.minValue(0)),
  messages: v.array(LongFreePyramidMessage),
})
export type LongFreePyramidControlProjectionState = v.InferOutput<typeof LongFreePyramidControlProjectionState>

const LongFreePyramidControlProjectionDetails = v.object({
  ...LongFreePyramidControlProjectionState.entries,
  isPotCommandAvailable: v.boolean(),
  controlSections: ControlSections,
})

export const LongFreePyramidControlProjection = v.object({
  ...GameControlProjection.entries,
  gameKey: v.literal('free-pyramid-long'),
  details: LongFreePyramidControlProjectionDetails,
})
export type LongFreePyramidControlProjection = v.InferOutput<typeof LongFreePyramidControlProjection>
