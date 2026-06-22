import invariant from 'tiny-invariant'

import type { GameplayRuntime } from './constants'
import { LongFreePyramidGameplayRuntime } from './long-free-pyramid/runtime'
import { PyramidGameplayRuntime } from './pyramid/runtime'
import type { RegisteredGameKey } from './registry'
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
} satisfies Record<RegisteredGameKey, () => GameplayRuntime>

export function getGameplayRuntime(gameKey: RegisteredGameKey): GameplayRuntime {
  const factory = runtimeFactories[gameKey]
  invariant(factory, `Unsupported game key: ${gameKey}`)
  return factory()
}
