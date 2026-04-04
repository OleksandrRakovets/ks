import { describe, expect, test } from 'bun:test'

import {
  applyGameCommand,
  createInitialGameState,
  deriveGameProjection,
  getGameMeta,
  listGameKeys,
  parseGameKey,
} from './index'

describe('gameplay runtime api', () => {
  test('lists registered game keys', () => {
    expect(listGameKeys()).toEqual([
      'free-pyramid',
      'free-pyramid-long',
      'combined-pyramid',
      'combined-pyramid-old',
      'strila-v2',
    ])
  })

  test('parses a supported game key', () => {
    expect(parseGameKey('free-pyramid')).toBe('free-pyramid')
  })

  test('returns game metadata', () => {
    expect(getGameMeta('free-pyramid')).toEqual({
      title: {
        uk: 'Вільна піраміда',
        en: 'Free pyramid',
      },
      inputMode: 'pyramid-basic',
    })
  })

  test('returns long free pyramid metadata', () => {
    expect(getGameMeta('free-pyramid-long')).toEqual({
      title: {
        uk: 'Вільна піраміда (довга)',
        en: 'Free pyramid (long)',
      },
      inputMode: 'pyramid-basic',
    })
  })

  test('returns Strila metadata', () => {
    expect(getGameMeta('strila-v2')).toEqual({
      title: {
        uk: 'Стріла',
        en: 'Strila',
      },
      inputMode: 'strila-basic',
    })
  })

  test('creates and updates free pyramid game state', () => {
    let state = createInitialGameState('free-pyramid')

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
    })

    ;({ state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state,
      commandType: 'shot.recorded',
      command: { seat: 'A', points: 3 },
    }))

    expect(state).toEqual({
      pointsBySeat: { A: 3, B: 0 },
    })
  })

  test('free pyramid clamps score at zero', () => {
    const { state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state: { pointsBySeat: { A: 1, B: 0 } },
      commandType: 'shot.recorded',
      command: { seat: 'A', points: -5 },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
    })
  })

  test('combined pyramid old keeps negative score', () => {
    const { state } = applyGameCommand({
      gameKey: 'combined-pyramid-old',
      state: { pointsBySeat: { A: 1, B: 0 } },
      commandType: 'shot.recorded',
      command: { seat: 'A', points: -5 },
    })

    expect(state).toEqual({
      pointsBySeat: { A: -4, B: 0 },
    })
  })

  test('combined pyramid clamps score at zero', () => {
    const { state } = applyGameCommand({
      gameKey: 'combined-pyramid',
      state: { pointsBySeat: { A: 1, B: 0 } },
      commandType: 'shot.recorded',
      command: { seat: 'A', points: -5 },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
    })
  })

  test('derives free pyramid scoreboard projection', () => {
    expect(
      deriveGameProjection({
        gameKey: 'free-pyramid',
        state: { pointsBySeat: { A: 4, B: 2 } },
        projection: 'scoreboard',
      }),
    ).toEqual({
      gameKey: 'free-pyramid',
      projection: 'scoreboard',
      score: { A: 4, B: 2 },
      details: {},
    })
  })

  test('creates and updates Strila game state', () => {
    let state = createInitialGameState('strila-v2')

    expect(state).toEqual({
      score: { A: 0, B: 0 },
      coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
      phase: { type: 'not-started' },
    })

    ;({ state } = applyGameCommand({
      gameKey: 'strila-v2',
      state,
      commandType: 'break-off',
      command: { actor: 'A' },
    }))

    expect(state).toEqual({
      score: { A: 0, B: 0 },
      coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
      phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 0 },
    })
  })

  test('derives Strila scoreboard projection', () => {
    expect(
      deriveGameProjection({
        gameKey: 'strila-v2',
        state: {
          score: { A: 2, B: 0 },
          coloredBallsOnTable: [2, 4, 7],
          phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 0 },
        },
        projection: 'scoreboard',
      }),
    ).toEqual({
      gameKey: 'strila-v2',
      projection: 'scoreboard',
      score: { A: 2, B: 0 },
      details: {
        objectBalls: [2, 4],
        ballsRemaining: [2, 4, 7],
        pointsAvailable: 6,
        phase: 'open-play',
        winner: undefined,
      },
    })
  })
})
