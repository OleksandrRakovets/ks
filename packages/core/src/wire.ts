import * as v from 'valibot'

import { NonEmptyProtocolEntriesSchema } from './protocol'
import { NonNegativeIntegerSchema } from './valicombos'

export const MatchStreamReadySchema = v.object({
  latestSeq: NonNegativeIntegerSchema,
})

export const AcceptedCommandStreamUpdateSchema = v.object({
  type: v.literal('command-accepted'),
  acceptedSeq: v.pipe(v.number(), v.integer(), v.minValue(1)),
  entries: NonEmptyProtocolEntriesSchema,
  terminal: v.boolean(),
})
export type AcceptedCommandStreamUpdate = v.InferOutput<typeof AcceptedCommandStreamUpdateSchema>
