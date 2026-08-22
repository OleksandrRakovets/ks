import { IntegerSchema } from '@ks/core'
import * as v from 'valibot'

export const PyramidGameKeySchema = v.picklist(['free-pyramid', 'combined-pyramid', 'combined-pyramid-old'])
export type PyramidGameKey = v.InferOutput<typeof PyramidGameKeySchema>

export const PyramidRulesSchema = v.object({
  gameKey: PyramidGameKeySchema,
  allowNegative: v.boolean(),
  foulPenalty: v.picklist(['opponent-plus-one', 'offender-minus-one']),
  shotPointOptions: v.pipe(v.array(IntegerSchema), v.minLength(1), v.readonly()),
})
export type PyramidRules = v.InferOutput<typeof PyramidRulesSchema>
export type PyramidRulesFor<K extends PyramidGameKey> = PyramidRules & { readonly gameKey: K }

export const PyramidRuleSpecificsByGameKey = {
  'free-pyramid': {
    gameKey: 'free-pyramid',
    allowNegative: false,
    foulPenalty: 'opponent-plus-one',
    shotPointOptions: [1, 2, 4],
  },
  'combined-pyramid': {
    gameKey: 'combined-pyramid',
    allowNegative: false,
    foulPenalty: 'opponent-plus-one',
    shotPointOptions: [1, 2],
  },
  'combined-pyramid-old': {
    gameKey: 'combined-pyramid-old',
    allowNegative: true,
    foulPenalty: 'offender-minus-one',
    shotPointOptions: [1, 2],
  },
} as const satisfies { readonly [K in PyramidGameKey]: PyramidRulesFor<K> }
