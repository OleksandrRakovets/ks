export type PyramidGameKey = 'free-pyramid' | 'combined-pyramid' | 'combined-pyramid-old'

export type PyramidRules<K extends PyramidGameKey = PyramidGameKey> = {
  readonly gameKey: K
  readonly allowNegative: boolean
  readonly foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
  readonly shotPointOptions: readonly number[]
}

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
} as const satisfies { readonly [K in PyramidGameKey]: PyramidRules<K> }
