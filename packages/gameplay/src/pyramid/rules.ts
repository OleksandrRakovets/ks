import { Integer } from '@ks/core'
import * as v from 'valibot'

const PyramidGameKey = v.picklist(['free-pyramid', 'combined-pyramid', 'combined-pyramid-old'])

export type PyramidGameKey = v.InferOutput<typeof PyramidGameKey>

export const PyramidRules = v.pipe(
  v.strictObject({
    gameKey: PyramidGameKey,
    allowNegative: v.boolean(),
    foulPenalty: v.picklist(['opponent-plus-one', 'offender-minus-one']),
    shotPointOptions: v.pipe(v.array(Integer), v.minLength(1), v.readonly()),
  }),
  v.readonly(),
)

export type PyramidRules = v.InferOutput<typeof PyramidRules>

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
