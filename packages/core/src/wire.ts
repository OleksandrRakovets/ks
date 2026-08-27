import * as v from 'valibot'

import { NonNegativeIntegerSchema, PositiveIntegerSchema } from './valicombos'

export const MatchStreamReadySchema = v.object({
  latestSeq: NonNegativeIntegerSchema,
})

export const MatchStreamUpdate = v.object({
  type: v.literal('command-accepted'),
  acceptedSeq: PositiveIntegerSchema,
  terminal: v.boolean(),
})
export type MatchStreamUpdate = v.InferOutput<typeof MatchStreamUpdate>
