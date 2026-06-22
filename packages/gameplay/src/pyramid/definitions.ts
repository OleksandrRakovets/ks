import { BySeatNumberSchema, ControlCommandSectionsSchema, NonEmptyStringSchema, SeatSchema } from '@ks/core'
import * as v from 'valibot'

import { GameControlProjectionSchema } from '../constants'

export const PyramidFrameStateSchema = v.object({
  pointsBySeat: BySeatNumberSchema,
  targetPointsBySeat: BySeatNumberSchema,
  phase: v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over']),
  winnerSeat: v.optional(SeatSchema),
})
export type PyramidFrameState = v.InferOutput<typeof PyramidFrameStateSchema>

export type PyramidRuntimeConfig = {
  gameKey: string
  allowNegative: boolean
  foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
  shotPointOptions: number[]
}

const PyramidControlDetailsSchema = v.object({
  phase: v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over']),
  winner: v.optional(SeatSchema),
  situationTitle: NonEmptyStringSchema,
  situationSummary: NonEmptyStringSchema,
  isPotCommandAvailable: v.boolean(),
  commandSections: ControlCommandSectionsSchema,
})

export const PyramidControlViewSchema = v.object({
  ...GameControlProjectionSchema.entries,
  details: PyramidControlDetailsSchema,
})
