import * as v from 'valibot'

import { StoredMatchFactSchema } from './facts'
import { NonNegativeIntegerSchema } from './valicombos'

export const StreamReadySchema = v.object({
  latestSeq: NonNegativeIntegerSchema,
})

export const StreamFactSchema = StoredMatchFactSchema
