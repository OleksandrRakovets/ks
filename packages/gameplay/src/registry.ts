export type GameInputMode = 'pyramid-basic' | 'strila-basic'

export type LocalizedGameTitle = {
  uk: string
  en: string
}

import invariant from 'tiny-invariant'

import type { GameplayRuntime } from './abstract-runtime'
import { PyramidGameplayRuntime } from './pyramid/runtime'
import { StrilaGameplayRuntime } from './strila-v2/runtime'

export type GameMeta = {
  title: LocalizedGameTitle
  inputMode: GameInputMode
}

function createPyramidEntry(args: {
  gameKey: string
  title: LocalizedGameTitle
  inputMode: GameInputMode
  allowNegative: boolean
}): { meta: GameMeta; runtime: GameplayRuntime } {
  return {
    meta: {
      title: args.title,
      inputMode: args.inputMode,
    },
    runtime: new PyramidGameplayRuntime(
      {
        gameKey: args.gameKey,
        title: args.title,
        inputMode: args.inputMode,
      },
      { allowNegative: args.allowNegative },
    ),
  }
}

export const registry = {
  'free-pyramid': createPyramidEntry({
    gameKey: 'free-pyramid',
    title: {
      uk: 'Вільна піраміда',
      en: 'Free pyramid',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
  }),
  'free-pyramid-long': createPyramidEntry({
    gameKey: 'free-pyramid-long',
    title: {
      uk: 'Вільна піраміда (довга)',
      en: 'Free pyramid (long)',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
  }),
  'combined-pyramid': createPyramidEntry({
    gameKey: 'combined-pyramid',
    title: {
      uk: 'Комбінована піраміда',
      en: 'Combined pyramid',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
  }),
  'combined-pyramid-old': createPyramidEntry({
    gameKey: 'combined-pyramid-old',
    title: {
      uk: 'Комбінована піраміда (старі правила)',
      en: 'Combined pyramid (old rules)',
    },
    inputMode: 'pyramid-basic',
    allowNegative: true,
  }),
  'strila-v2': {
    meta: {
      title: {
        uk: 'Стріла',
        en: 'Strila',
      },
      inputMode: 'strila-basic',
    },
    runtime: new StrilaGameplayRuntime(),
  },
} as const

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
  return entry.runtime
}
