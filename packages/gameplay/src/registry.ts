import * as v from 'valibot'

import type { GameMeta } from './constants'
import {
  LongFreePyramidCommandSchema,
  LongFreePyramidControlViewSchema,
} from './long-free-pyramid/definitions'
import {
  CombinedPyramidControlViewSchema,
  CombinedPyramidOldControlViewSchema,
  FreePyramidControlViewSchema,
  PyramidCommandSchema,
} from './pyramid/definitions'
import { StrilaCommandSchema, StrilaControlViewSchema } from './strila-v2/definitions'

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
    commandSchema: StrilaCommandSchema,
    controlSchema: StrilaControlViewSchema,
  },
  'free-pyramid': {
    meta: {
      title: {
        uk: 'Вільна піраміда',
        en: 'Free pyramid',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommandSchema,
    controlSchema: FreePyramidControlViewSchema,
  },
  'free-pyramid-long': {
    meta: {
      title: {
        uk: 'Вільна піраміда з продовженням',
        en: 'Free pyramid (long)',
      },
      defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
    },
    commandSchema: LongFreePyramidCommandSchema,
    controlSchema: LongFreePyramidControlViewSchema,
  },
  'combined-pyramid': {
    meta: {
      title: {
        uk: 'Комбінована піраміда',
        en: 'Combined pyramid',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommandSchema,
    controlSchema: CombinedPyramidControlViewSchema,
  },
  'combined-pyramid-old': {
    meta: {
      title: {
        uk: 'Комбінована піраміда (старі правила)',
        en: 'Combined pyramid (old rules)',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommandSchema,
    controlSchema: CombinedPyramidOldControlViewSchema,
  },
} as const satisfies Record<string, RegistryEntry>

// SAFETY: registry is a non-empty object, and Object.keys returns exactly its runtime string keys.
const registeredGameKeys = Object.keys(registry) as [keyof typeof registry, ...(keyof typeof registry)[]]
export const RegisteredGameKeySchema = v.picklist(registeredGameKeys)
export type RegisteredGameKey = v.InferOutput<typeof RegisteredGameKeySchema>

export type ControlProjectionFor<K extends RegisteredGameKey> = v.InferOutput<
  (typeof registry)[K]['controlSchema']
>
export type GameCommandFor<K extends RegisteredGameKey> = v.InferOutput<(typeof registry)[K]['commandSchema']>

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
