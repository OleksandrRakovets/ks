import { Integer } from '@ks/core'
import { Schema } from 'effect'

export const PyramidGameKey = Schema.Literals(['free-pyramid', 'combined-pyramid', 'combined-pyramid-old'])

type PyramidGameKey = typeof PyramidGameKey.Type

export const PyramidRules = Schema.Struct({
  gameKey: PyramidGameKey,
  allowNegative: Schema.Boolean,
  foulPenalty: Schema.Literals(['opponent-plus-one', 'offender-minus-one']),
  shotPointOptions: Schema.Array(Integer).check(Schema.isMinLength(1)),
})

export type PyramidRulesFor<K extends PyramidGameKey> = typeof PyramidRules.Type & { readonly gameKey: K }

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
