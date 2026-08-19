import type { GameMeta } from './constants'

type RegistryEntry = {
  meta: GameMeta
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
  },
} as const satisfies Record<string, RegistryEntry>

export type RegisteredGameKey = keyof typeof registry

export function isRegisteredGameKey(value: string): value is RegisteredGameKey {
  return value in registry
}

export function listGameKeys(): RegisteredGameKey[] {
  const keys: RegisteredGameKey[] = []
  for (const key of Object.keys(registry)) {
    if (isRegisteredGameKey(key)) keys.push(key)
  }
  return keys
}

export function getGameMeta(gameKey: RegisteredGameKey): GameMeta {
  return registry[gameKey].meta
}
