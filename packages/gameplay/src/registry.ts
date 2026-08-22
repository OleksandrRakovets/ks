import * as v from 'valibot'

import type { GameMeta } from './constants'
import type {
  LongFreePyramidControlView,
  LongFreePyramidFrameState,
  LongFreePyramidScoreboardView,
  LongFreePyramidSummaryView,
} from './long-free-pyramid/definitions'
import type {
  PyramidControlViewFor,
  PyramidFrameState,
  PyramidScoreboardViewFor,
  PyramidSummaryViewFor,
} from './pyramid/definitions'
import type { PyramidGameKey } from './pyramid/rules'
import type { StrilaControlView, StrilaFrameState, StrilaScoreboardView, StrilaSummaryView } from './strila-v2/definitions'

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

// SAFETY: registry is a non-empty object, and Object.keys returns exactly its runtime string keys.
const registeredGameKeys = Object.keys(registry) as [keyof typeof registry, ...(keyof typeof registry)[]]
export const RegisteredGameKeySchema = v.picklist(registeredGameKeys)
export type RegisteredGameKey = v.InferOutput<typeof RegisteredGameKeySchema>

export type GameContracts = {
  'strila-v2': {
    state: StrilaFrameState
    control: StrilaControlView
    scoreboard: StrilaScoreboardView
    summary: StrilaSummaryView
  }
  'free-pyramid-long': {
    state: LongFreePyramidFrameState
    control: LongFreePyramidControlView
    scoreboard: LongFreePyramidScoreboardView
    summary: LongFreePyramidSummaryView
  }
} & {
  [K in PyramidGameKey]: {
    state: PyramidFrameState
    control: PyramidControlViewFor<K>
    scoreboard: PyramidScoreboardViewFor<K>
    summary: PyramidSummaryViewFor<K>
  }
}

export type GameStateFor<K extends RegisteredGameKey> = GameContracts[K]['state']
export type ControlProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['control']
export type ScoreboardProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['scoreboard']
export type SummaryProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['summary']

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

export function getGameMeta(gameKey: RegisteredGameKey): GameMeta {
  return registry[gameKey].meta
}

export function parseGameKey(value: string): RegisteredGameKey {
  return v.parse(RegisteredGameKeySchema, value)
}
