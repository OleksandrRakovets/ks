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
      'strila-v2',
      'free-pyramid',
      'free-pyramid-long',
      'combined-pyramid',
      'combined-pyramid-old',
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
      description: {
        uk: 'Удари по будь-якій кулі: +1, +2 або +4 очки. Фол — суперник +1.',
        en: 'Pot any ball for +1, +2, or +4 points. Foul gives opponent +1.',
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
      description: {
        uk: 'Вільна піраміда до 30 очок — довга партія для серйозної гри.',
        en: 'Free pyramid to 30 points — extended frame for a serious game.',
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
      description: {
        uk: 'Класична стріла — чергування ходів, забивання кольорових куль.',
        en: 'Classic Strila — alternating shots, potting coloured balls.',
      },
      inputMode: 'strila-basic',
      defaultFrameTargetPointsBySeat: { A: 9, B: 9 },
    })
  })

  test('creates and updates free pyramid game state', () => {
    let state = createInitialGameState('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 } })

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'not-started',
    })

    ;({ state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state,
      commandType: 'frame.commence',
      command: { seat: 'A' },
    }))

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })

    ;({ state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state,
      commandType: 'pot.record',
      command: { seat: 'A', points: 3 },
    }))

    expect(state).toEqual({
      pointsBySeat: { A: 3, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })
  })

  test('free pyramid clamps score at zero', () => {
    const { state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state: { pointsBySeat: { A: 1, B: 0 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
      commandType: 'pot.record',
      command: { seat: 'A', points: -5 },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })
  })

  test('combined pyramid old keeps negative score', () => {
    const { state } = applyGameCommand({
      gameKey: 'combined-pyramid-old',
      state: { pointsBySeat: { A: 1, B: 0 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
      commandType: 'pot.record',
      command: { seat: 'A', points: -5 },
    })

    expect(state).toEqual({
      pointsBySeat: { A: -4, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })
  })

  test('combined pyramid clamps score at zero', () => {
    const { state } = applyGameCommand({
      gameKey: 'combined-pyramid',
      state: { pointsBySeat: { A: 1, B: 0 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
      commandType: 'pot.record',
      command: { seat: 'A', points: -5 },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })
  })

  test('free pyramid foul awards one point to opponent', () => {
    const { state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state: { pointsBySeat: { A: 3, B: 2 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
      commandType: 'foul.commit',
      command: { seat: 'A' },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 3, B: 3 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })
  })

  test('combined pyramid old foul deducts offender and allows negative score', () => {
    const { state } = applyGameCommand({
      gameKey: 'combined-pyramid-old',
      state: { pointsBySeat: { A: 0, B: 4 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
      commandType: 'foul.commit',
      command: { seat: 'A' },
    })

    expect(state).toEqual({
      pointsBySeat: { A: -1, B: 4 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })
  })

  test('derives free pyramid scoreboard projection', () => {
    expect(
      deriveGameProjection({
        gameKey: 'free-pyramid',
        state: { pointsBySeat: { A: 4, B: 2 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
        projection: 'scoreboard',
      }),
    ).toEqual({
      gameKey: 'free-pyramid',
      projection: 'scoreboard',
      score: { A: 4, B: 2 },
      details: { phase: 'open-play', winner: undefined },
    })
  })

  test('free pyramid control starts with frame.commence choices', () => {
    expect(
      deriveGameProjection({
        gameKey: 'free-pyramid',
        state: { pointsBySeat: { A: 0, B: 0 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'not-started' },
        projection: 'control',
      }),
    ).toEqual({
      gameKey: 'free-pyramid',
      projection: 'control',
      score: { A: 0, B: 0 },
      availableCommands: [
        { commandType: 'frame.commence', command: { seat: 'A' }, label: 'Break-off (A)', primary: true },
        { commandType: 'frame.commence', command: { seat: 'B' }, label: 'Break-off (B)', primary: true },
      ],
      details: {
        phase: 'not-started',
        winner: undefined,
        situationTitle: 'Break-off',
        situationSummary: 'Choose the player to open the frame.',
      },
    })
  })

  test('free pyramid control keeps scoring after target and exposes frame.award', () => {
    expect(
      deriveGameProjection({
        gameKey: 'free-pyramid',
        state: { pointsBySeat: { A: 10, B: 2 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
        projection: 'control',
      }),
    ).toEqual({
      gameKey: 'free-pyramid',
      projection: 'control',
      score: { A: 10, B: 2 },
      availableCommands: [
        { commandType: 'pot.record', command: { points: 1 }, label: '+1', primary: true },
        { commandType: 'pot.record', command: { points: 2 }, label: '+2', primary: true },
        { commandType: 'pot.record', command: { points: 4 }, label: '+4', primary: true },
        {
          commandType: 'foul.commit',
          command: {},
          label: 'Foul',
          effectSummary: 'Opponent +1 point',
        },
        { commandType: 'frame.award', command: { seat: 'A' }, label: 'Award frame', secondary: true },
      ],
      details: {
        phase: 'open-play',
        winner: undefined,
        situationTitle: 'Open play',
        situationSummary: 'Record shot value or foul for either player.',
      },
    })
  })

  test('combined pyramid old control projects +1, +2 and foul deduction', () => {
    expect(
      deriveGameProjection({
        gameKey: 'combined-pyramid-old',
        state: { pointsBySeat: { A: 2, B: 1 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
        projection: 'control',
      }),
    ).toEqual({
      gameKey: 'combined-pyramid-old',
      projection: 'control',
      score: { A: 2, B: 1 },
      availableCommands: [
        { commandType: 'pot.record', command: { points: 1 }, label: '+1', primary: true },
        { commandType: 'pot.record', command: { points: 2 }, label: '+2', primary: true },
        {
          commandType: 'foul.commit',
          command: {},
          label: 'Foul',
          effectSummary: 'Offender -1 point (negative allowed)',
        },
      ],
      details: {
        phase: 'open-play',
        winner: undefined,
        situationTitle: 'Open play',
        situationSummary: 'Record shot value or foul for either player.',
      },
    })
  })

  test('free pyramid frame.award closes gameplay state', () => {
    const { state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state: { pointsBySeat: { A: 10, B: 2 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
      commandType: 'frame.award',
      command: { seat: 'A' },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 10, B: 2 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'frame-over',
      winnerSeat: 'A',
    })
  })

  test('creates and updates Strila game state', () => {
    let state = createInitialGameState('strila-v2', { targetPointsBySeat: { A: 9, B: 9 } })

    expect(state).toEqual({
      score: { A: 0, B: 0 },
      targetPointsBySeat: { A: 9, B: 9 },
      coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
      phase: { type: 'not-started' },
    })

    ;({ state } = applyGameCommand({
      gameKey: 'strila-v2',
      state,
      commandType: 'frame.commence',
      command: { actor: 'A' },
    }))

    expect(state).toEqual({
      score: { A: 0, B: 0 },
      targetPointsBySeat: { A: 9, B: 9 },
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
          targetPointsBySeat: { A: 9, B: 9 },
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
