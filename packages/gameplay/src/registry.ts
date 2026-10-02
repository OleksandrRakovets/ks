import { Schema } from 'effect'

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
  readonly commandSchema: Schema.ConstraintDecoder<unknown>
  readonly presentationSchema: Schema.ConstraintDecoder<unknown>
  readonly checkpointSchema: Schema.ConstraintDecoder<unknown>
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

export const GameKey = Schema.Literals(registeredGameKeys)

type GameKey = typeof GameKey.Type

/** Correlates the registered game key with its complete executable frame state. */
export const GameplayCheckpoint = Schema.Union([
  Schema.Struct({ gameKey: Schema.Literal('strila-v2'), state: registry['strila-v2'].checkpointSchema }),
  Schema.Struct({
    gameKey: Schema.Literal('free-pyramid-long'),
    state: registry['free-pyramid-long'].checkpointSchema,
  }),
  Schema.Struct({ gameKey: Schema.Literal('free-pyramid'), state: registry['free-pyramid'].checkpointSchema }),
  Schema.Struct({
    gameKey: Schema.Literal('combined-pyramid'),
    state: registry['combined-pyramid'].checkpointSchema,
  }),
  Schema.Struct({
    gameKey: Schema.Literal('combined-pyramid-old'),
    state: registry['combined-pyramid-old'].checkpointSchema,
  }),
])

export type GameplayCheckpointStateFor<K extends GameKey> = (typeof registry)[K]['checkpointSchema']['Type']

export type GamePresentationFor<K extends GameKey> = (typeof registry)[K]['presentationSchema']['Type']

export type GameCommandFor<K extends GameKey> = (typeof registry)[K]['commandSchema']['Type']

export function isGameKey(value: string): value is GameKey {
  return Schema.is(GameKey)(value)
}

export function listGameKeys(): GameKey[] {
  const keys: GameKey[] = []

  for (const key of Object.keys(registry)) {
    if (isGameKey(key)) keys.push(key)
  }

  return keys
}
