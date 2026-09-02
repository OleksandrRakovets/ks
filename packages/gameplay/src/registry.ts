import * as v from 'valibot'

import type { GameMeta } from './constants'
import { LongFreePyramidCommand, LongFreePyramidControlProjection } from './long-free-pyramid/definitions'
import {
  CombinedPyramidControlProjection,
  CombinedPyramidOldControlProjection,
  FreePyramidControlProjection,
  PyramidCommand,
} from './pyramid/definitions'
import { StrilaCommand, StrilaControlProjection } from './strila-v2/definitions'

type RegistryEntry = {
  meta: GameMeta
  commandSchema: v.GenericSchema
  controlSchema: v.GenericSchema
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
    commandSchema: StrilaCommand,
    controlSchema: StrilaControlProjection,
  },
  'free-pyramid': {
    meta: {
      title: {
        uk: 'Вільна піраміда',
        en: 'Free pyramid',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommand,
    controlSchema: FreePyramidControlProjection,
  },
  'free-pyramid-long': {
    meta: {
      title: {
        uk: 'Вільна піраміда з продовженням',
        en: 'Free pyramid (long)',
      },
      defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
    },
    commandSchema: LongFreePyramidCommand,
    controlSchema: LongFreePyramidControlProjection,
  },
  'combined-pyramid': {
    meta: {
      title: {
        uk: 'Комбінована піраміда',
        en: 'Combined pyramid',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommand,
    controlSchema: CombinedPyramidControlProjection,
  },
  'combined-pyramid-old': {
    meta: {
      title: {
        uk: 'Комбінована піраміда (старі правила)',
        en: 'Combined pyramid (old rules)',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommand,
    controlSchema: CombinedPyramidOldControlProjection,
  },
} as const satisfies Record<string, RegistryEntry>

// SAFETY: registry is a non-empty object, and Object.keys returns exactly its runtime string keys.
const registeredGameKeys = Object.keys(registry) as [keyof typeof registry, ...(keyof typeof registry)[]]
export const RegisteredGameKey = v.picklist(registeredGameKeys)
export type RegisteredGameKey = v.InferOutput<typeof RegisteredGameKey>

export type ControlProjectionFor<K extends RegisteredGameKey> = v.InferOutput<
  (typeof registry)[K]['controlSchema']
>
export type GameCommandFor<K extends RegisteredGameKey> = v.InferOutput<(typeof registry)[K]['commandSchema']>

export function isRegisteredGameKey(value: string): value is RegisteredGameKey {
  return v.is(RegisteredGameKey, value)
}

export function listGameKeys(): RegisteredGameKey[] {
  const keys: RegisteredGameKey[] = []
  for (const key of Object.keys(registry)) {
    if (isRegisteredGameKey(key)) keys.push(key)
  }
  return keys
}
