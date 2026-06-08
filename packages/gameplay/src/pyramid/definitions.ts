import { ControlCommandSectionsSchema, NonEmptyStringSchema, SeatSchema } from '@ks/core'
import * as v from 'valibot'

import { GameControlProjectionSchema } from '../constants'

const PyramidControlDetailsSchema = v.object({
  phase: v.picklist(['not-started', 'open-play', 'frame-over']),
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
