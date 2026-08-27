import * as v from 'valibot'

import { NonNegativeInteger, PositiveInteger } from './valicombos'

export const MatchStreamReady = v.object({
  latestSeq: NonNegativeInteger,
})
export type MatchStreamReady = v.InferOutput<typeof MatchStreamReady>

export const MatchStreamUpdate = v.object({
  type: v.literal('command-accepted'),
  acceptedSeq: PositiveInteger,
  terminal: v.boolean(),
})
export type MatchStreamUpdate = v.InferOutput<typeof MatchStreamUpdate>
