import { BySeatNumberSchema, ControlCommandSectionsSchema, NonEmptyStringSchema, SeatSchema } from '@ks/core'
import * as v from 'valibot'

import { GameControlProjectionSchema } from '../constants'

export const LongFreePyramidRackSchema = v.object({
  rackNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
  scoreBySeat: BySeatNumberSchema,
})

export const LongFreePyramidControlDetailsSchema = v.object({
  phase: v.picklist(['not-started', 'open-play', 'winner-determined', 'awaiting-award', 'frame-over']),
  winner: v.optional(SeatSchema),
  rackHistory: v.pipe(v.array(LongFreePyramidRackSchema), v.minLength(1)),
  currentRack: LongFreePyramidRackSchema,
  ballsRemoved: v.pipe(v.number(), v.integer(), v.minValue(0)),
  ballsOnTable: v.pipe(v.number(), v.integer(), v.minValue(0)),
  messages: v.array(NonEmptyStringSchema),
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
