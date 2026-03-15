export type GameInputMode = 'pyramid-basic'

export const registry = {
  'free-pyramid': {
    meta: {
      label: 'Free pyramid',
      inputMode: 'pyramid-basic',
    },
  },
  'combined-pyramid-old': {
    meta: {
      label: 'Combined pyramid (old)',
      inputMode: 'pyramid-basic',
    },
  },
} as const

export type RegisteredGameKey = keyof typeof registry

export const gameKeys = Object.keys(registry) as RegisteredGameKey[]

export function isRegisteredGameKey(value: string): value is RegisteredGameKey {
  return value in registry
}
