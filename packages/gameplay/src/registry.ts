import type { GameCommandResult, GameCreateStateArgs, GameMeta } from './constants'
import type {
  LongFreePyramidControlView,
  LongFreePyramidFrameState,
  LongFreePyramidScoreboardView,
  LongFreePyramidSummaryView,
} from './long-free-pyramid/definitions'
import type {
  CombinedPyramidControlView,
  CombinedPyramidOldControlView,
  CombinedPyramidOldScoreboardView,
  CombinedPyramidOldSummaryView,
  CombinedPyramidScoreboardView,
  CombinedPyramidSummaryView,
  FreePyramidControlView,
  FreePyramidScoreboardView,
  FreePyramidSummaryView,
  PyramidFrameState,
} from './pyramid/definitions'
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

export type RegisteredGameKey = keyof typeof registry

export type GameContracts = {
  'strila-v2': {
    state: StrilaFrameState
    control: StrilaControlView
    scoreboard: StrilaScoreboardView
    summary: StrilaSummaryView
  }
  'free-pyramid': {
    state: PyramidFrameState
    control: FreePyramidControlView
    scoreboard: FreePyramidScoreboardView
    summary: FreePyramidSummaryView
  }
  'free-pyramid-long': {
    state: LongFreePyramidFrameState
    control: LongFreePyramidControlView
    scoreboard: LongFreePyramidScoreboardView
    summary: LongFreePyramidSummaryView
  }
  'combined-pyramid': {
    state: PyramidFrameState
    control: CombinedPyramidControlView
    scoreboard: CombinedPyramidScoreboardView
    summary: CombinedPyramidSummaryView
  }
  'combined-pyramid-old': {
    state: PyramidFrameState
    control: CombinedPyramidOldControlView
    scoreboard: CombinedPyramidOldScoreboardView
    summary: CombinedPyramidOldSummaryView
  }
}

export type GameStateFor<K extends RegisteredGameKey> = GameContracts[K]['state']
export type ControlProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['control']
export type ScoreboardProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['scoreboard']
export type SummaryProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['summary']

export interface GameplayDefinition<K extends RegisteredGameKey> {
  readonly key: K
  createInitialState(args: GameCreateStateArgs): GameStateFor<K>
  applyCommand(args: { state: GameStateFor<K>; commandType: string; command: unknown }): GameCommandResult<GameStateFor<K>>
  deriveControl(state: GameStateFor<K>): ControlProjectionFor<K>
  deriveScoreboard(state: GameStateFor<K>): ScoreboardProjectionFor<K>
  deriveSummary(state: GameStateFor<K>): SummaryProjectionFor<K>
}

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
