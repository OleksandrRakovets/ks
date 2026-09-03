import * as v from 'valibot'

import { NonNegativeInteger, PositiveInteger } from './valicombos'

export const MatchStreamReady = v.pipe(
  v.object({
    latestSeq: NonNegativeInteger,
  }),
  v.readonly(),
)
export type MatchStreamReady = v.InferOutput<typeof MatchStreamReady>

export const MatchStreamUpdate = v.pipe(
  v.object({
    type: v.literal('command-accepted'),
    acceptedSeq: PositiveInteger,
    terminal: v.boolean(),
  }),
  v.readonly(),
)
export type MatchStreamUpdate = v.InferOutput<typeof MatchStreamUpdate>
