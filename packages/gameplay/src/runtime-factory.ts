import invariant from 'tiny-invariant'

import { LongFreePyramidGameplayRuntime } from './long-free-pyramid/runtime'
import { PyramidGameplayRuntime } from './pyramid/runtime'
import type { GameplayDefinition, RegisteredGameKey } from './registry'
import { StrilaGameplayRuntime } from './strila-v2/runtime'

const runtimeFactories = {
  'strila-v2': () => new StrilaGameplayRuntime(),
  'free-pyramid': () =>
    new PyramidGameplayRuntime({
      gameKey: 'free-pyramid',
      allowNegative: false,
      foulPenalty: 'opponent-plus-one',
      shotPointOptions: [1, 2, 4],
    }),
  'free-pyramid-long': () => new LongFreePyramidGameplayRuntime(),
  'combined-pyramid': () =>
    new PyramidGameplayRuntime({
      gameKey: 'combined-pyramid',
      allowNegative: false,
      foulPenalty: 'opponent-plus-one',
      shotPointOptions: [1, 2],
    }),
  'combined-pyramid-old': () =>
    new PyramidGameplayRuntime({
      gameKey: 'combined-pyramid-old',
      allowNegative: true,
      foulPenalty: 'offender-minus-one',
      shotPointOptions: [1, 2],
    }),
} satisfies { [K in RegisteredGameKey]: () => GameplayDefinition<K> }

export function getGameplayRuntime<K extends RegisteredGameKey>(gameKey: K): GameplayDefinition<K> {
  const factory = runtimeFactories[gameKey]
  invariant(factory, `Unsupported game key: ${gameKey}`)
  // SAFETY: The exhaustive factory map relates each indexed key to GameplayDefinition<K>.
  return factory() as GameplayDefinition<K>
}
