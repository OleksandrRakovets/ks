import * as v from 'valibot'

import type { GameMeta } from './constants'
import {
  LongFreePyramidCheckpoint,
  LongFreePyramidCommand,
  LongFreePyramidGamePresentation,
} from './long-free-pyramid/definitions'
import {
  CombinedPyramidGamePresentation,
  CombinedPyramidOldGamePresentation,
  FreePyramidGamePresentation,
  PyramidCheckpoint,
  PyramidCommand,
} from './pyramid/definitions'
import { StrilaCheckpoint, StrilaCommand, StrilaGamePresentation } from './strila-v2/definitions'

type RegistryEntry = {
  readonly meta: GameMeta
  readonly commandSchema: v.GenericSchema
  readonly presentationSchema: v.GenericSchema
  readonly checkpointSchema: v.GenericSchema
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
      maxFrameTargetPoints: 14,
    },
    commandSchema: StrilaCommand,
    presentationSchema: StrilaGamePresentation,
    checkpointSchema: StrilaCheckpoint,
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
      maxFrameTargetPoints: 15,
    },
    commandSchema: PyramidCommand,
    presentationSchema: FreePyramidGamePresentation,
    checkpointSchema: PyramidCheckpoint,
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
      maxFrameTargetPoints: 101,
    },
    commandSchema: LongFreePyramidCommand,
    presentationSchema: LongFreePyramidGamePresentation,
    checkpointSchema: LongFreePyramidCheckpoint,
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
      maxFrameTargetPoints: 15,
    },
    commandSchema: PyramidCommand,
    presentationSchema: CombinedPyramidGamePresentation,
    checkpointSchema: PyramidCheckpoint,
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
      maxFrameTargetPoints: 15,
    },
    commandSchema: PyramidCommand,
    presentationSchema: CombinedPyramidOldGamePresentation,
    checkpointSchema: PyramidCheckpoint,
  },
} as const satisfies Record<string, RegistryEntry>

// SAFETY: registry is a non-empty object, and Object.keys returns exactly its runtime string keys.
const registeredGameKeys = Object.keys(registry) as [keyof typeof registry, ...(keyof typeof registry)[]]

export const GameKey = v.picklist(registeredGameKeys)

export type GameKey = v.InferOutput<typeof GameKey>

/** Correlates the registered game key with its complete executable frame state. */
export const GameplayCheckpoint = v.variant('gameKey', [
  v.pipe(
    v.strictObject({ gameKey: v.literal('strila-v2'), state: registry['strila-v2'].checkpointSchema }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({
      gameKey: v.literal('free-pyramid-long'),
      state: registry['free-pyramid-long'].checkpointSchema,
    }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({ gameKey: v.literal('free-pyramid'), state: registry['free-pyramid'].checkpointSchema }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({
      gameKey: v.literal('combined-pyramid'),
      state: registry['combined-pyramid'].checkpointSchema,
    }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({
      gameKey: v.literal('combined-pyramid-old'),
      state: registry['combined-pyramid-old'].checkpointSchema,
    }),
    v.readonly(),
  ),
])

export type GameplayCheckpoint = v.InferOutput<typeof GameplayCheckpoint>

export type GameplayCheckpointStateFor<K extends GameKey> = v.InferOutput<
  (typeof registry)[K]['checkpointSchema']
>

export type GamePresentationFor<K extends GameKey> = v.InferOutput<(typeof registry)[K]['presentationSchema']>

export type GameCommandFor<K extends GameKey> = v.InferOutput<(typeof registry)[K]['commandSchema']>

export function isGameKey(value: string): value is GameKey {
  return v.is(GameKey, value)
}

/** @internal Enumerates registered games for command-boundary tests. */
export function listGameKeys(): GameKey[] {
  const keys: GameKey[] = []

  for (const key of Object.keys(registry)) {
    if (isGameKey(key)) keys.push(key)
  }

  return keys
}
