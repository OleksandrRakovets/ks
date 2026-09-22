import * as v from 'valibot'

import type { GameMeta } from './constants'
import { LongFreePyramidCommand, LongFreePyramidGamePresentation } from './long-free-pyramid/definitions'
import {
  CombinedPyramidGamePresentation,
  CombinedPyramidOldGamePresentation,
  FreePyramidGamePresentation,
  PyramidCommand,
} from './pyramid/definitions'
import { StrilaCommand, StrilaGamePresentation } from './strila-v2/definitions'

type RegistryEntry = {
  readonly meta: GameMeta
  readonly commandSchema: v.GenericSchema
  readonly presentationSchema: v.GenericSchema
}

export const registry = {
  'strila-v2': {
    meta: {
      title: {
        uk: 'Стріла',
        en: 'Strila',
      },
      shortGameTitle: {
        uk: 'Стріла',
        en: 'Strila',
      },
      defaultFrameTargetPointsBySeat: { A: 9, B: 9 },
    },
    commandSchema: StrilaCommand,
    presentationSchema: StrilaGamePresentation,
  },
  'free-pyramid': {
    meta: {
      title: {
        uk: 'Вільна піраміда',
        en: 'Free Pyramid',
      },
      shortGameTitle: {
        uk: 'Вільна',
        en: 'Free',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommand,
    presentationSchema: FreePyramidGamePresentation,
  },
  'free-pyramid-long': {
    meta: {
      title: {
        uk: 'Вільна піраміда з продовженням',
        en: 'Continuous Free Pyramid',
      },
      shortGameTitle: {
        uk: 'Вільна з продовженням',
        en: 'Continuous Free',
      },
      defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
    },
    commandSchema: LongFreePyramidCommand,
    presentationSchema: LongFreePyramidGamePresentation,
  },
  'combined-pyramid': {
    meta: {
      title: {
        uk: 'Комбінована піраміда',
        en: 'Combined Pyramid',
      },
      shortGameTitle: {
        uk: 'Комбінована',
        en: 'Combined',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommand,
    presentationSchema: CombinedPyramidGamePresentation,
  },
  'combined-pyramid-old': {
    meta: {
      title: {
        uk: 'Комбінована піраміда (старі правила)',
        en: 'Combined Pyramid (old rules)',
      },
      shortGameTitle: {
        uk: 'Комбінована (стара)',
        en: 'Combined (old)',
      },
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    },
    commandSchema: PyramidCommand,
    presentationSchema: CombinedPyramidOldGamePresentation,
  },
} as const satisfies Record<string, RegistryEntry>

// SAFETY: registry is a non-empty object, and Object.keys returns exactly its runtime string keys.
const registeredGameKeys = Object.keys(registry) as [keyof typeof registry, ...(keyof typeof registry)[]]

export const RegisteredGameKey = v.picklist(registeredGameKeys)

export type RegisteredGameKey = v.InferOutput<typeof RegisteredGameKey>

export type GamePresentationFor<K extends RegisteredGameKey> = v.InferOutput<
  (typeof registry)[K]['presentationSchema']
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
