import { z } from 'zod'

import { SeatSchema } from './match'

const ControlCommandSourceSchema = z.enum(['match', 'game'])

const ControlCommandBaseSchema = z.object({
  source: ControlCommandSourceSchema,
  commandType: z.string().min(1),
  command: z.record(z.string(), z.unknown()),
})

export const ControlCommandSchema = ControlCommandBaseSchema
export type ControlCommand = z.infer<typeof ControlCommandSchema>

const ControlCommandProminenceSchema = z.enum(['primary', 'secondary', 'tertiary'])

export const ControlCommandPresetSchema = ControlCommandBaseSchema.extend({
  seat: SeatSchema.optional(),
  label: z.string().min(1).optional(),
  effectSummary: z.string().min(1).optional(),
  warning: z.string().min(1).optional(),
  helpText: z.string().min(1).optional(),
  prominence: ControlCommandProminenceSchema,
})
export type ControlCommandPreset = z.infer<typeof ControlCommandPresetSchema>

const SeatControlCommandBucketSchema = z.object({
  A: z.array(ControlCommandPresetSchema),
  B: z.array(ControlCommandPresetSchema),
})

export const ControlCommandSectionsSchema = z.object({
  neutral: z.array(ControlCommandPresetSchema),
  primary: SeatControlCommandBucketSchema,
  secondary: SeatControlCommandBucketSchema,
  tertiary: SeatControlCommandBucketSchema,
})
export type ControlCommandSections = z.infer<typeof ControlCommandSectionsSchema>

export function emptyControlCommandSections(): ControlCommandSections {
  return {
    neutral: [],
    primary: { A: [], B: [] },
    secondary: { A: [], B: [] },
    tertiary: { A: [], B: [] },
  }
}
