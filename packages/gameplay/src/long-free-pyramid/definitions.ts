import { BySeatNumberSchema, ControlCommandSectionsSchema, IntegerSchema, SeatSchema } from '@ks/core'
import * as v from 'valibot'

import { GameControlProjectionSchema, GameScoreboardProjectionSchema, GameSummaryProjectionSchema } from '../constants'

export const LongFreePyramidRackSchema = v.object({
  rackNumber: v.pipe(IntegerSchema, v.minValue(1)),
  scoreBySeat: BySeatNumberSchema,
})
export type LongFreePyramidRack = v.InferOutput<typeof LongFreePyramidRackSchema>

const LongFreePyramidMessageSchema = v.object({
  code: v.literal('rack-started'),
  rackNumber: v.pipe(IntegerSchema, v.minValue(1)),
})

export const LongFreePyramidFrameStateSchema = v.object({
  racks: v.pipe(v.array(LongFreePyramidRackSchema), v.minLength(1)),
  targetPointsBySeat: BySeatNumberSchema,
  rackRollover: v.picklist([14, 15]),
  phase: v.picklist(['not-started', 'open-play', 'winner-determined', 'awaiting-award', 'frame-over']),
  winnerSeat: v.optional(SeatSchema),
  messages: v.array(LongFreePyramidMessageSchema),
})
export type LongFreePyramidFrameState = v.InferOutput<typeof LongFreePyramidFrameStateSchema>

export const LongFreePyramidProjectionDetailsSchema = v.object({
  phase: v.picklist(['not-started', 'open-play', 'winner-determined', 'awaiting-award', 'frame-over']),
  winner: v.optional(SeatSchema),
  rackHistory: v.pipe(v.array(LongFreePyramidRackSchema), v.minLength(1)),
  currentRack: LongFreePyramidRackSchema,
  ballsRemoved: v.pipe(IntegerSchema, v.minValue(0)),
  ballsOnTable: v.pipe(IntegerSchema, v.minValue(0)),
  messages: v.array(LongFreePyramidMessageSchema),
})
export type LongFreePyramidProjectionDetails = v.InferOutput<typeof LongFreePyramidProjectionDetailsSchema>

export const LongFreePyramidControlDetailsSchema = v.object({
  ...LongFreePyramidProjectionDetailsSchema.entries,
  isPotCommandAvailable: v.boolean(),
  commandSections: ControlCommandSectionsSchema,
})
export type LongFreePyramidControlDetails = v.InferOutput<typeof LongFreePyramidControlDetailsSchema>

export const LongFreePyramidControlViewSchema = v.object({
  ...GameControlProjectionSchema.entries,
  gameKey: v.literal('free-pyramid-long'),
  details: LongFreePyramidControlDetailsSchema,
})
export type LongFreePyramidControlView = v.InferOutput<typeof LongFreePyramidControlViewSchema>

export const LongFreePyramidScoreboardViewSchema = v.object({
  ...GameScoreboardProjectionSchema.entries,
  gameKey: v.literal('free-pyramid-long'),
  details: LongFreePyramidProjectionDetailsSchema,
})
export type LongFreePyramidScoreboardView = v.InferOutput<typeof LongFreePyramidScoreboardViewSchema>

export const LongFreePyramidSummaryViewSchema = v.object({
  ...GameSummaryProjectionSchema.entries,
  gameKey: v.literal('free-pyramid-long'),
  details: LongFreePyramidProjectionDetailsSchema,
})
export type LongFreePyramidSummaryView = v.InferOutput<typeof LongFreePyramidSummaryViewSchema>
