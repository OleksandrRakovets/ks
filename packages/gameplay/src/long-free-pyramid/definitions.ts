import { BySeatNumber, ControlSections, Integer, Seat } from '@ks/core'
import * as v from 'valibot'

import {
  FoulCommitCommandSchema,
  FrameAwardCommandSchema,
  FrameCommenceCommandSchema,
} from '../command-schemas'
import { GameControlProjectionSchema } from '../constants'

const LongFreePyramidPottedBallCountSchema = v.picklist([1, 2, 3, 4])

export const LongFreePyramidCommandSchema = v.variant('type', [
  FrameCommenceCommandSchema,
  v.strictObject({
    type: v.literal('pot.record'),
    seat: Seat,
    pottedBallCount: LongFreePyramidPottedBallCountSchema,
  }),
  FoulCommitCommandSchema,
  FrameAwardCommandSchema,
])
export type LongFreePyramidCommand = v.InferOutput<typeof LongFreePyramidCommandSchema>

const LongFreePyramidRackSchema = v.object({
  rackNumber: v.pipe(Integer, v.minValue(1)),
  scoreBySeat: BySeatNumber,
})
export type LongFreePyramidRack = v.InferOutput<typeof LongFreePyramidRackSchema>

const LongFreePyramidMessageSchema = v.object({
  code: v.literal('rack-started'),
  rackNumber: v.pipe(Integer, v.minValue(1)),
})
export const LongFreePyramidPhaseSchema = v.picklist([
  'not-started',
  'open-play',
  'winner-determined',
  'awaiting-award',
  'frame-over',
])
export type LongFreePyramidPhase = v.InferOutput<typeof LongFreePyramidPhaseSchema>

const LongFreePyramidContextSchema = v.object({
  racks: v.pipe(v.array(LongFreePyramidRackSchema), v.minLength(1)),
  targetPoints: BySeatNumber,
  rackRollover: v.picklist([14, 15]),
  winner: v.nullable(Seat),
  messages: v.array(LongFreePyramidMessageSchema),
})
export type LongFreePyramidContext = v.InferOutput<typeof LongFreePyramidContextSchema>

const LongFreePyramidProjectionDetailsSchema = v.object({
  phase: LongFreePyramidPhaseSchema,
  winner: v.optional(Seat),
  rackHistory: v.pipe(v.array(LongFreePyramidRackSchema), v.minLength(1)),
  currentRack: LongFreePyramidRackSchema,
  ballsRemoved: v.pipe(Integer, v.minValue(0)),
  ballsOnTable: v.pipe(Integer, v.minValue(0)),
  messages: v.array(LongFreePyramidMessageSchema),
})
export type LongFreePyramidProjectionDetails = v.InferOutput<typeof LongFreePyramidProjectionDetailsSchema>

const LongFreePyramidControlDetailsSchema = v.object({
  ...LongFreePyramidProjectionDetailsSchema.entries,
  isPotCommandAvailable: v.boolean(),
  controlSections: ControlSections,
})

export const LongFreePyramidControlViewSchema = v.object({
  ...GameControlProjectionSchema.entries,
  gameKey: v.literal('free-pyramid-long'),
  details: LongFreePyramidControlDetailsSchema,
})
export type LongFreePyramidControlView = v.InferOutput<typeof LongFreePyramidControlViewSchema>
