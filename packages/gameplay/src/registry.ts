import invariant from 'tiny-invariant'

import type { GameplayRuntime } from './abstract-runtime'
import type { GameMeta } from './constants'
import { PyramidGameplayRuntime } from './pyramid/runtime'
import { StrilaGameplayRuntime } from './strila-v2/runtime'

type PyramidRuntimeConfig = {
  meta: GameMeta
  runtimeClass: typeof PyramidGameplayRuntime
  runtimeArgs: ConstructorParameters<typeof PyramidGameplayRuntime>
}

type StrilaRuntimeConfig = {
  meta: GameMeta
  runtimeClass: typeof StrilaGameplayRuntime
}

type RegistryEntry = PyramidRuntimeConfig | StrilaRuntimeConfig

export const registry = {
  'strila-v2': {
    meta: {
      title: {
        uk: 'Стріла',
        en: 'Strila',
      },
      inputMode: 'strila-basic',
      defaultFrameTargetPointsBySeat: { A: 9, B: 9 },
    },
    runtimeClass: StrilaGameplayRuntime,
  },
  'free-pyramid': {
    meta: {
      title: {
        uk: 'Вільна піраміда',
        en: 'Free pyramid',
      },
      inputMode: 'pyramid-basic',
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    runtimeClass: PyramidGameplayRuntime,
    runtimeArgs: [
      {
        gameKey: 'free-pyramid',
        allowNegative: false,
        foulPenalty: 'opponent-plus-one',
        shotPointOptions: [1, 2, 4],
      },
    ],
  },
  'free-pyramid-long': {
    meta: {
      title: {
        uk: 'Вільна піраміда з продовженням',
        en: 'Free pyramid (long)',
      },
      inputMode: 'pyramid-basic',
      defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
    },
    runtimeClass: PyramidGameplayRuntime,
    runtimeArgs: [
      {
        gameKey: 'free-pyramid-long',
        allowNegative: false,
        foulPenalty: 'opponent-plus-one',
        shotPointOptions: [1, 2, 4],
      },
    ],
  },
  'combined-pyramid': {
    meta: {
      title: {
        uk: 'Комбінована піраміда',
        en: 'Combined pyramid',
      },
      inputMode: 'pyramid-basic',
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    runtimeClass: PyramidGameplayRuntime,
    runtimeArgs: [
      {
        gameKey: 'combined-pyramid',
        allowNegative: false,
        foulPenalty: 'opponent-plus-one',
        shotPointOptions: [1, 2],
      },
    ],
  },
  'combined-pyramid-old': {
    meta: {
      title: {
        uk: 'Комбінована піраміда (старі правила)',
        en: 'Combined pyramid (old rules)',
      },
      inputMode: 'pyramid-basic',
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    runtimeClass: PyramidGameplayRuntime,
    runtimeArgs: [
      {
        gameKey: 'combined-pyramid-old',
        allowNegative: true,
        foulPenalty: 'offender-minus-one',
        shotPointOptions: [1, 2],
      },
    ],
  },
} as const satisfies Record<string, RegistryEntry>

export type RegisteredGameKey = keyof typeof registry

export function isRegisteredGameKey(value: string): value is RegisteredGameKey {
  return value in registry
}

export function listGameKeys(): RegisteredGameKey[] {
  return Object.keys(registry) as RegisteredGameKey[]
}

export function getGameMeta(gameKey: RegisteredGameKey): GameMeta {
  return registry[gameKey].meta
}

export function getGameplayRuntime(gameKey: RegisteredGameKey): GameplayRuntime {
  const entry = registry[gameKey]
  invariant(entry, `Unsupported game key: ${gameKey}`)

  if ('runtimeArgs' in entry) {
    const [config] = entry.runtimeArgs
    return new entry.runtimeClass(config)
  }

  return new entry.runtimeClass()
}
