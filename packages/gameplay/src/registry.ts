import type { BySeatNumber } from '@ks/core'
import invariant from 'tiny-invariant'

import type { GameplayRuntime } from './abstract-runtime'
import type { LocalizedGameTitle, GameInputMode, GameMeta } from './constants'
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

function createPyramidEntry(args: {
  gameKey: string
  title: LocalizedGameTitle
  inputMode: GameInputMode
  allowNegative: boolean
  foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
  shotPointOptions: number[]
  defaultFrameTargetPointsBySeat: BySeatNumber
}): PyramidRuntimeConfig {
  return {
    meta: {
      title: args.title,
      inputMode: args.inputMode,
      defaultFrameTargetPointsBySeat: args.defaultFrameTargetPointsBySeat,
    },
    runtimeClass: PyramidGameplayRuntime,
    runtimeArgs: [
      {
        gameKey: args.gameKey,
        title: args.title,
        inputMode: args.inputMode,
      },
      {
        allowNegative: args.allowNegative,
        foulPenalty: args.foulPenalty,
        shotPointOptions: args.shotPointOptions,
      },
    ],
  }
}

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
  'free-pyramid': createPyramidEntry({
    gameKey: 'free-pyramid',
    title: {
      uk: 'Вільна піраміда',
      en: 'Free pyramid',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
    foulPenalty: 'opponent-plus-one',
    shotPointOptions: [1, 2, 4],
    defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
  }),
  'free-pyramid-long': createPyramidEntry({
    gameKey: 'free-pyramid-long',
    title: {
      uk: 'Вільна піраміда з продовженням',
      en: 'Free pyramid (long)',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
    foulPenalty: 'opponent-plus-one',
    shotPointOptions: [1, 2, 4],
    defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
  }),
  'combined-pyramid': createPyramidEntry({
    gameKey: 'combined-pyramid',
    title: {
      uk: 'Комбінована піраміда',
      en: 'Combined pyramid',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
    foulPenalty: 'opponent-plus-one',
    shotPointOptions: [1, 2],
    defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
  }),
  'combined-pyramid-old': createPyramidEntry({
    gameKey: 'combined-pyramid-old',
    title: {
      uk: 'Комбінована піраміда (старі правила)',
      en: 'Combined pyramid (old rules)',
    },
    inputMode: 'pyramid-basic',
    allowNegative: true,
    foulPenalty: 'offender-minus-one',
    shotPointOptions: [1, 2],
    defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
  }),
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
    return new entry.runtimeClass(...entry.runtimeArgs)
  }

  return new entry.runtimeClass()
}
