import * as v from 'valibot'

import type { GameMeta } from './constants'
import type { LongFreePyramidCommand, LongFreePyramidControlView } from './long-free-pyramid/definitions'
import type { PyramidCommand, PyramidControlViewFor } from './pyramid/definitions'
import type { PyramidGameKey } from './pyramid/rules'
import type { StrilaCommand, StrilaControlView } from './strila-v2/definitions'

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
      defaultFrameTargetPointsBySeat: { A: 9, B: 9 },
    },
  },
  'free-pyramid': {
    meta: {
      title: {
        uk: 'Вільна піраміда',
        en: 'Free pyramid',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
  },
  'free-pyramid-long': {
    meta: {
      title: {
        uk: 'Вільна піраміда з продовженням',
        en: 'Free pyramid (long)',
      },
      defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
    },
  },
  'combined-pyramid': {
    meta: {
      title: {
        uk: 'Комбінована піраміда',
        en: 'Combined pyramid',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
  },
  'combined-pyramid-old': {
    meta: {
      title: {
        uk: 'Комбінована піраміда (старі правила)',
        en: 'Combined pyramid (old rules)',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
  },
} as const satisfies Record<string, RegistryEntry>

// SAFETY: registry is a non-empty object, and Object.keys returns exactly its runtime string keys.
const registeredGameKeys = Object.keys(registry) as [keyof typeof registry, ...(keyof typeof registry)[]]
export const RegisteredGameKeySchema = v.picklist(registeredGameKeys)
export type RegisteredGameKey = v.InferOutput<typeof RegisteredGameKeySchema>

type GameContracts = {
  'strila-v2': {
    control: StrilaControlView
    command: StrilaCommand
  }
  'free-pyramid-long': {
    control: LongFreePyramidControlView
    command: LongFreePyramidCommand
  }
} & {
  [K in PyramidGameKey]: {
    control: PyramidControlViewFor<K>
    command: PyramidCommand
  }
}

export type ControlProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['control']
export type GameCommandFor<K extends RegisteredGameKey> = GameContracts[K]['command']

export function isRegisteredGameKey(value: string): value is RegisteredGameKey {
  return v.is(RegisteredGameKeySchema, value)
}

export function listGameKeys(): RegisteredGameKey[] {
  const keys: RegisteredGameKey[] = []
  for (const key of Object.keys(registry)) {
    if (isRegisteredGameKey(key)) keys.push(key)
  }
  return keys
}
