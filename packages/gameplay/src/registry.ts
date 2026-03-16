export type GameInputMode = 'pyramid-basic'

export type LocalizedGameTitle = {
  uk: string
  en: string
}

export const registry = {
  'free-pyramid': {
    meta: {
      title: {
        uk: 'Вільна піраміда',
        en: 'Free pyramid',
      } satisfies LocalizedGameTitle,
      inputMode: 'pyramid-basic',
    },
  },
  'combined-pyramid-old': {
    meta: {
      title: {
        uk: 'Комбінована піраміда (старі правила)',
        en: 'Combined pyramid (old rules)',
      } satisfies LocalizedGameTitle,
      inputMode: 'pyramid-basic',
    },
  },
} as const

export type RegisteredGameKey = keyof typeof registry

export const gameKeys = Object.keys(registry) as RegisteredGameKey[]

export function isRegisteredGameKey(value: string): value is RegisteredGameKey {
  return value in registry
}
