import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import type { GameCreateStateArgs } from './constants'
import { parseGameKey } from './gameplay'
import {
  LongFreePyramidControlViewSchema,
  LongFreePyramidScoreboardViewSchema,
  LongFreePyramidSummaryViewSchema,
} from './long-free-pyramid/definitions'
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
  getGameMeta,
  listGameKeys,
  type RegisteredGameKey,
  type ScoreboardProjectionFor,
  type SummaryProjectionFor,
} from './registry'
import { createGameplaySession } from './session-factory'
import { StrilaControlViewSchema, StrilaScoreboardViewSchema, StrilaSummaryViewSchema } from './strila-v2/definitions'

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
  const initialArgs: GameCreateStateArgs = {
    targetPointsBySeat: gameKey === 'free-pyramid-long' ? { A: 30, B: 30 } : { A: 9, B: 9 },
    breakerSeat: 'A',
  }
  if (gameKey === 'free-pyramid-long') initialArgs.gameConfiguration = { rackRollover: 14 }
  const session = createGameplaySession(gameKey, initialArgs)
  try {
    const control: ControlProjectionFor<K> = session.deriveControl()
    const scoreboard: ScoreboardProjectionFor<K> = session.deriveScoreboard()
    const summary: SummaryProjectionFor<K> = session.deriveSummary()
    return { control, scoreboard, summary }
  } finally {
    session.dispose()
  }
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

  test('each session preserves its exact key across every projection', () => {
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
