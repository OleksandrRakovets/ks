import { ControlCommandSectionsSchema, SeatSchema } from '@ks/core'
import { z } from 'zod'

import { GameControlProjectionSchema } from '../constants'

const PyramidControlDetailsSchema = z.object({
  phase: z.enum(['not-started', 'open-play', 'frame-over']),
  winner: SeatSchema.optional(),
  situationTitle: z.string().min(1),
  situationSummary: z.string().min(1),
  isPotCommandAvailable: z.boolean(),
  commandSections: ControlCommandSectionsSchema,
})

export const PyramidControlViewSchema = GameControlProjectionSchema.extend({
  details: PyramidControlDetailsSchema,
})
