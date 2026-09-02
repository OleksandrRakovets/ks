import { BySeatNumber, ControlSections, Integer, Seat } from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommand, FrameAwardCommand, FrameCommenceCommand } from '../command-schemas'
import { GameControlProjection } from '../constants'

const LongFreePyramidPottedBallCount = v.picklist([1, 2, 3, 4])

export const LongFreePyramidCommand = v.variant('type', [
  FrameCommenceCommand,
  v.pipe(
    v.strictObject({
      type: v.literal('pot.record'),
      seat: Seat,
      pottedBallCount: LongFreePyramidPottedBallCount,
    }),
    v.readonly(),
  ),
  FoulCommitCommand,
  FrameAwardCommand,
])
export type LongFreePyramidCommand = v.InferOutput<typeof LongFreePyramidCommand>

const LongFreePyramidRack = v.pipe(
  v.object({
    rackNumber: v.pipe(Integer, v.minValue(1)),
    scoreBySeat: BySeatNumber,
  }),
  v.readonly(),
)
export type LongFreePyramidRack = v.InferOutput<typeof LongFreePyramidRack>

const LongFreePyramidMessage = v.pipe(
  v.object({
    code: v.literal('rack-started'),
    rackNumber: v.pipe(Integer, v.minValue(1)),
  }),
  v.readonly(),
)
type LongFreePyramidMessage = v.InferOutput<typeof LongFreePyramidMessage>
export const LongFreePyramidPhase = v.picklist([
  'not-started',
  'open-play',
  'winner-determined',
  'awaiting-award',
  'frame-over',
])
export type LongFreePyramidPhase = v.InferOutput<typeof LongFreePyramidPhase>

const LongFreePyramidContext = v.pipe(
  v.object({
    racks: v.pipe(v.array(LongFreePyramidRack), v.minLength(1), v.readonly()),
    targetPoints: BySeatNumber,
    rackRollover: v.picklist([14, 15]),
    winner: v.nullable(Seat),
    messages: v.pipe(v.array(LongFreePyramidMessage), v.readonly()),
  }),
  v.readonly(),
)
export type LongFreePyramidContext = v.InferOutput<typeof LongFreePyramidContext>

const LongFreePyramidControlProjectionState = v.pipe(
  v.object({
    phase: LongFreePyramidPhase,
    winner: v.optional(Seat),
    rackHistory: v.pipe(v.array(LongFreePyramidRack), v.minLength(1), v.readonly()),
    currentRack: LongFreePyramidRack,
    ballsRemoved: v.pipe(Integer, v.minValue(0)),
    ballsOnTable: v.pipe(Integer, v.minValue(0)),
    messages: v.pipe(v.array(LongFreePyramidMessage), v.readonly()),
  }),
  v.readonly(),
)
export type LongFreePyramidControlProjectionState = v.InferOutput<typeof LongFreePyramidControlProjectionState>

const LongFreePyramidControlProjectionDetails = v.pipe(
  v.object({
    ...LongFreePyramidControlProjectionState.entries,
    isPotCommandAvailable: v.boolean(),
    controlSections: ControlSections,
  }),
  v.readonly(),
)
type LongFreePyramidControlProjectionDetails = v.InferOutput<typeof LongFreePyramidControlProjectionDetails>

export const LongFreePyramidControlProjection = v.pipe(
  v.object({
    ...GameControlProjection.entries,
    gameKey: v.literal('free-pyramid-long'),
    details: LongFreePyramidControlProjectionDetails,
  }),
  v.readonly(),
)
export type LongFreePyramidControlProjection = v.InferOutput<typeof LongFreePyramidControlProjection>
