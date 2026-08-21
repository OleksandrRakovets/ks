import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import type { GameCreateStateArgs } from './constants'
import { parseGameKey } from './gameplay'
import {
  LongFreePyramidControlViewSchema,
  LongFreePyramidScoreboardViewSchema,
  LongFreePyramidSummaryViewSchema,
} from './long-free-pyramid/definitions'
import type {
  FreePyramidControlView,
  FreePyramidScoreboardView,
  FreePyramidSummaryView,
  PyramidFrameState,
} from './pyramid/definitions'
import {
  CombinedPyramidControlViewSchema,
  CombinedPyramidOldControlViewSchema,
  CombinedPyramidOldScoreboardViewSchema,
  CombinedPyramidOldSummaryViewSchema,
  CombinedPyramidScoreboardViewSchema,
  CombinedPyramidSummaryViewSchema,
  FreePyramidControlViewSchema,
  FreePyramidScoreboardViewSchema,
  FreePyramidSummaryViewSchema,
} from './pyramid/definitions'
import {
  type ControlProjectionFor,
  type GameplayDefinition,
  getGameMeta,
  listGameKeys,
  type RegisteredGameKey,
  type ScoreboardProjectionFor,
  type SummaryProjectionFor,
} from './registry'
import { getGameplayRuntime } from './runtime-factory'
import {
  StrilaControlViewSchema,
  type StrilaFrameState,
  StrilaScoreboardViewSchema,
  StrilaSummaryViewSchema,
} from './strila-v2/definitions'

type StrilaDefinition = GameplayDefinition<'strila-v2'>
type IncompatibleStateDefinition = Omit<StrilaDefinition, 'createInitialState'> & {
  createInitialState(args: GameCreateStateArgs): PyramidFrameState
}
type IncompatibleControlDefinition = Omit<StrilaDefinition, 'deriveControl'> & {
  deriveControl(state: StrilaFrameState): FreePyramidControlView
}
type IncompatibleScoreboardDefinition = Omit<StrilaDefinition, 'deriveScoreboard'> & {
  deriveScoreboard(state: StrilaFrameState): FreePyramidScoreboardView
}
type IncompatibleSummaryDefinition = Omit<StrilaDefinition, 'deriveSummary'> & {
  deriveSummary(state: StrilaFrameState): FreePyramidSummaryView
}

type AssertFalse<T extends false> = T
type _IncompatibleStateIsRejected = AssertFalse<IncompatibleStateDefinition extends StrilaDefinition ? true : false>
type _IncompatibleControlIsRejected = AssertFalse<IncompatibleControlDefinition extends StrilaDefinition ? true : false>
type _IncompatibleScoreboardIsRejected = AssertFalse<IncompatibleScoreboardDefinition extends StrilaDefinition ? true : false>
type _IncompatibleSummaryIsRejected = AssertFalse<IncompatibleSummaryDefinition extends StrilaDefinition ? true : false>

const projectionSchemas = {
  'strila-v2': {
    control: StrilaControlViewSchema,
    scoreboard: StrilaScoreboardViewSchema,
    summary: StrilaSummaryViewSchema,
  },
  'free-pyramid': {
    control: FreePyramidControlViewSchema,
    scoreboard: FreePyramidScoreboardViewSchema,
    summary: FreePyramidSummaryViewSchema,
  },
  'free-pyramid-long': {
    control: LongFreePyramidControlViewSchema,
    scoreboard: LongFreePyramidScoreboardViewSchema,
    summary: LongFreePyramidSummaryViewSchema,
  },
  'combined-pyramid': {
    control: CombinedPyramidControlViewSchema,
    scoreboard: CombinedPyramidScoreboardViewSchema,
    summary: CombinedPyramidSummaryViewSchema,
  },
  'combined-pyramid-old': {
    control: CombinedPyramidOldControlViewSchema,
    scoreboard: CombinedPyramidOldScoreboardViewSchema,
    summary: CombinedPyramidOldSummaryViewSchema,
  },
}

function projectionsFor<K extends RegisteredGameKey>(gameKey: K) {
  const runtime = getGameplayRuntime(gameKey)
  const initialArgs: GameCreateStateArgs = {
    targetPointsBySeat: runtime.key === 'free-pyramid-long' ? { A: 30, B: 30 } : { A: 9, B: 9 },
    breakerSeat: 'A',
  }
  if (runtime.key === 'free-pyramid-long') initialArgs.gameConfiguration = { rackRollover: 14 }
  const state = runtime.createInitialState(initialArgs)
  const control: ControlProjectionFor<K> = runtime.deriveControl(state)
  const scoreboard: ScoreboardProjectionFor<K> = runtime.deriveScoreboard(state)
  const summary: SummaryProjectionFor<K> = runtime.deriveSummary(state)
  return { control, scoreboard, summary }
}

describe('game registry', () => {
  test('lists registered game keys', () => {
    expect(listGameKeys()).toEqual([
      'strila-v2',
      'free-pyramid',
      'free-pyramid-long',
      'combined-pyramid',
      'combined-pyramid-old',
    ])
  })

  test('each runtime preserves its exact key across every projection', () => {
    for (const gameKey of listGameKeys()) {
      const projections = projectionsFor(gameKey)
      expect(projections.control.gameKey).toBe(gameKey)
      expect(projections.scoreboard.gameKey).toBe(gameKey)
      expect(projections.summary.gameKey).toBe(gameKey)
      expect(v.safeParse(projectionSchemas[gameKey].control, projections.control).success).toBe(true)
      expect(v.safeParse(projectionSchemas[gameKey].scoreboard, projections.scoreboard).success).toBe(true)
      expect(v.safeParse(projectionSchemas[gameKey].summary, projections.summary).success).toBe(true)
    }
  })

  test('parses a supported game key', () => {
    expect(parseGameKey('free-pyramid')).toBe('free-pyramid')
    expect(() => parseGameKey('historical-game')).toThrow()
  })

  test('returns free pyramid metadata', () => {
    expect(getGameMeta('free-pyramid')).toEqual({
      title: {
        uk: 'Вільна піраміда',
        en: 'Free pyramid',
      },
      inputMode: 'pyramid-basic',
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    })
  })

  test('returns long free pyramid metadata', () => {
    expect(getGameMeta('free-pyramid-long')).toEqual({
      title: {
        uk: 'Вільна піраміда з продовженням',
        en: 'Free pyramid (long)',
      },
      inputMode: 'pyramid-basic',
      defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
    })
  })

  test('returns Strila metadata', () => {
    expect(getGameMeta('strila-v2')).toEqual({
      title: {
        uk: 'Стріла',
        en: 'Strila',
      },
      inputMode: 'strila-basic',
      defaultFrameTargetPointsBySeat: { A: 9, B: 9 },
    })
  })
})
