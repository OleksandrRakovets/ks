import * as v from 'valibot'

import { SeatSchema } from './match'
import { NonEmptyStringSchema, UnknownObjectSchema } from './valicombos'

const ControlCommandSourceSchema = v.picklist(['match', 'game'])

const ControlCommandBaseSchema = v.object({
  source: ControlCommandSourceSchema,
  commandType: NonEmptyStringSchema,
  command: UnknownObjectSchema,
})

export const ControlCommandSchema = ControlCommandBaseSchema
export type ControlCommand = v.InferOutput<typeof ControlCommandSchema>
export type ControlCommandPayload = ControlCommand['command']

const ControlCommandProminenceSchema = v.picklist(['primary', 'secondary', 'tertiary'])
const ControlCommandEffectSchema = v.picklist([
  'opponent-plus-one',
  'offender-minus-one',
  'plus-one-point',
  'no-points-awarded',
])

export const ControlCommandPresetSchema = v.object({
  ...ControlCommandBaseSchema.entries,
  seat: v.optional(SeatSchema),
  effect: v.optional(ControlCommandEffectSchema),
  prominence: ControlCommandProminenceSchema,
})
export type ControlCommandPreset = v.InferOutput<typeof ControlCommandPresetSchema>

const SeatControlCommandBucketSchema = v.object({
  A: v.array(ControlCommandPresetSchema),
  B: v.array(ControlCommandPresetSchema),
})

export const ControlCommandSectionsSchema = v.object({
  neutral: v.array(ControlCommandPresetSchema),
  primary: SeatControlCommandBucketSchema,
  secondary: SeatControlCommandBucketSchema,
  tertiary: SeatControlCommandBucketSchema,
})
export type ControlCommandSections = v.InferOutput<typeof ControlCommandSectionsSchema>

export function emptyControlCommandSections(): ControlCommandSections {
  return {
    neutral: [],
    primary: { A: [], B: [] },
    secondary: { A: [], B: [] },
    tertiary: { A: [], B: [] },
  }
}
