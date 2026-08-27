import * as v from 'valibot'

import { NonEmptyProtocolEntries } from './protocol'
import { NonNegativeIntegerSchema } from './valicombos'

export const MatchStreamReadySchema = v.object({
  latestSeq: NonNegativeIntegerSchema,
})

export const AcceptedCommandStreamUpdate = v.pipe(
  v.object({
    type: v.literal('command-accepted'),
    acceptedSeq: v.pipe(v.number(), v.integer(), v.minValue(1)),
    entries: NonEmptyProtocolEntries,
    terminal: v.boolean(),
  }),
  v.check(
    (update) => update.entries.every((entry) => entry.acceptedSeq === update.acceptedSeq),
    'Live Protocol entries do not belong to the accepted command batch',
  ),
)
export type AcceptedCommandStreamUpdate = v.InferOutput<typeof AcceptedCommandStreamUpdate>
