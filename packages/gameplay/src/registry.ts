export type GameInputMode = 'pyramid-basic' | 'strila-basic'

export type LocalizedGameTitle = {
  uk: string
  en: string
}

import type { BySeatNumber } from '@ks/core'
import invariant from 'tiny-invariant'

import type { GameplayRuntime } from './abstract-runtime'
import { PyramidGameplayRuntime } from './pyramid/runtime'
import { StrilaGameplayRuntime } from './strila-v2/runtime'

export type GameMeta = {
  title: LocalizedGameTitle
  description: LocalizedGameTitle
  inputMode: GameInputMode
  defaultFrameTargetPointsBySeat: BySeatNumber
}

function createPyramidEntry(args: {
  gameKey: string
  title: LocalizedGameTitle
  description: LocalizedGameTitle
  inputMode: GameInputMode
  allowNegative: boolean
  foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
  shotPointOptions: number[]
  defaultFrameTargetPointsBySeat: BySeatNumber
}): { meta: GameMeta; runtime: GameplayRuntime } {
  return {
    meta: {
      title: args.title,
      description: args.description,
      inputMode: args.inputMode,
      defaultFrameTargetPointsBySeat: args.defaultFrameTargetPointsBySeat,
    },
    runtime: new PyramidGameplayRuntime(
      {
        gameKey: args.gameKey,
        title: args.title,
        inputMode: args.inputMode,
      },
      {
        allowNegative: args.allowNegative,
        foulPenalty: args.foulPenalty,
        shotPointOptions: args.shotPointOptions,
      },
    ),
  }
}

export const registry = {
  'strila-v2': {
    meta: {
      title: {
        uk: 'Стріла',
        en: 'Strila',
      },
      description: {
        uk: 'Класична стріла — чергування ходів, забивання кольорових куль.',
        en: 'Classic Strila — alternating shots, potting coloured balls.',
      },
      inputMode: 'strila-basic',
      defaultFrameTargetPointsBySeat: { A: 9, B: 9 },
    },
    runtime: new StrilaGameplayRuntime(),
  },
  'free-pyramid': createPyramidEntry({
    gameKey: 'free-pyramid',
    title: {
      uk: 'Вільна піраміда',
      en: 'Free pyramid',
    },
    description: {
      uk: 'Удари по будь-якій кулі: +1, +2 або +4 очки. Фол — суперник +1.',
      en: 'Pot any ball for +1, +2, or +4 points. Foul gives opponent +1.',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
    foulPenalty: 'opponent-plus-one',
    shotPointOptions: [1, 2, 4],
    defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
  }),
  'free-pyramid-long': createPyramidEntry({
    gameKey: 'free-pyramid-long',
    title: {
      uk: 'Вільна піраміда з продовженням',
      en: 'Free pyramid (long)',
    },
    description: {
      uk: 'Вільна піраміда до 30 очок — довга партія для серйозної гри.',
      en: 'Free pyramid to 30 points — extended frame for a serious game.',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
    foulPenalty: 'opponent-plus-one',
    shotPointOptions: [1, 2, 4],
    defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
  }),
  'combined-pyramid': createPyramidEntry({
    gameKey: 'combined-pyramid',
    title: {
      uk: 'Комбінована піраміда',
      en: 'Combined pyramid',
    },
    description: {
      uk: 'Удари +1 або +2 очки. Фол — суперник +1.',
      en: 'Pot for +1 or +2 points. Foul gives opponent +1.',
    },
    inputMode: 'pyramid-basic',
    allowNegative: false,
    foulPenalty: 'opponent-plus-one',
    shotPointOptions: [1, 2],
    defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
  }),
  'combined-pyramid-old': createPyramidEntry({
    gameKey: 'combined-pyramid-old',
    title: {
      uk: 'Комбінована піраміда (старі правила)',
      en: 'Combined pyramid (old rules)',
    },
    description: {
      uk: "Комбінована піраміда: фол — -1 порушнику, рахунок може бути від'ємним.",
      en: 'Combined pyramid: foul deducts -1 from offender, score may go negative.',
    },
    inputMode: 'pyramid-basic',
    allowNegative: true,
    foulPenalty: 'offender-minus-one',
    shotPointOptions: [1, 2],
    defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
  }),
} as const

export type RegisteredGameKey = keyof typeof registry

export function isRegisteredGameKey(value: string): value is RegisteredGameKey {
  return value in registry
}

export function listGameKeys(): RegisteredGameKey[] {
  return Object.keys(registry) as RegisteredGameKey[]
}

export function getGameMeta(gameKey: RegisteredGameKey): GameMeta {
  return registry[gameKey].meta
}

export function getGameplayRuntime(gameKey: RegisteredGameKey): GameplayRuntime {
  const entry = registry[gameKey]
  invariant(entry, `Unsupported game key: ${gameKey}`)
  return entry.runtime
}
