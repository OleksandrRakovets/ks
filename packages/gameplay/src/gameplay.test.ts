import { describe, expect, test } from 'bun:test'

import type { BySeatNumber, Seat } from '@ks/core'

import { applyGameCommand, createInitialGameState, deriveGameProjection, parseGameKey } from './gameplay'
import { getGameMeta, listGameKeys } from './registry'

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

  test('creates and updates free pyramid game state', () => {
    let state = createInitialGameState('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })

    let protocolEntries
    ;({ state, protocolEntries } = applyGameCommand({
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
    expect(protocolEntries).toEqual([
      {
        source: 'player',
        entryType: 'player-command',
        seat: 'A',
        scoreAfter: { A: 3, B: 0 },
        body: { commandType: 'pot.record', points: 3 },
      },
    ])
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

  test('free pyramid control has no manual break-off choices', () => {
    const projection = deriveGameProjection({
      gameKey: 'free-pyramid',
      state: { pointsBySeat: { A: 0, B: 0 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'not-started' },
      projection: 'control',
    }) as {
      gameKey: string
      projection: 'control'
      score: BySeatNumber
      details: {
        phase: string
        winner?: Seat
        isPotCommandAvailable: boolean
        commandSections: {
          primary: { A: Array<{ commandType: string }>; B: Array<{ commandType: string }> }
        }
      }
    }

    expect(projection.gameKey).toBe('free-pyramid')
    expect(projection.projection).toBe('control')
    expect(projection.score).toEqual({ A: 0, B: 0 })
    expect(projection.details.phase).toBe('not-started')
    expect(projection.details.isPotCommandAvailable).toBe(false)
    expect(projection.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual([])
    expect(projection.details.commandSections.primary.B.map((entry) => entry.commandType)).toEqual([])
  })

  test('free pyramid control keeps scoring after target and exposes frame.award', () => {
    const projection = deriveGameProjection({
      gameKey: 'free-pyramid',
      state: { pointsBySeat: { A: 10, B: 2 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
      projection: 'control',
    }) as {
      details: {
        isPotCommandAvailable: boolean
        commandSections: {
          primary: { A: Array<{ commandType: string }>; B: Array<{ commandType: string }> }
          secondary: { A: Array<{ commandType: string }>; B: Array<{ commandType: string }> }
        }
      }
    }

    expect(projection.details.isPotCommandAvailable).toBe(true)
    expect(projection.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'frame.award',
    ])
    expect(projection.details.commandSections.primary.B.map((entry) => entry.commandType)).toEqual(['pot.record'])
    expect(projection.details.commandSections.secondary.A.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'pot.record',
      'foul.commit',
    ])
    expect(projection.details.commandSections.secondary.B.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'pot.record',
      'foul.commit',
    ])
  })

  test('combined pyramid old control projects +1, +2 and foul deduction', () => {
    const projection = deriveGameProjection({
      gameKey: 'combined-pyramid-old',
      state: { pointsBySeat: { A: 2, B: 1 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play' },
      projection: 'control',
    }) as {
      details: {
        commandSections: {
          primary: { A: Array<{ commandType: string }>; B: Array<{ commandType: string }> }
          secondary: {
            A: Array<{ commandType: string; effectSummary?: string }>
            B: Array<{ commandType: string; effectSummary?: string }>
          }
        }
      }
    }

    expect(projection.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual(['pot.record'])
    expect(projection.details.commandSections.primary.B.map((entry) => entry.commandType)).toEqual(['pot.record'])
    expect(projection.details.commandSections.secondary.A.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'foul.commit',
    ])
    expect(projection.details.commandSections.secondary.B.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'foul.commit',
    ])
    expect(
      projection.details.commandSections.secondary.A.find((entry) => entry.commandType === 'foul.commit')?.effectSummary,
    ).toBe('Offender -1 point (negative allowed)')
  })

  test('free pyramid frame.award closes gameplay state', () => {
    const { state, protocolEntries } = applyGameCommand({
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
    expect(protocolEntries).toEqual([
      { source: 'player', entryType: 'player-command', seat: 'A', body: { commandType: 'frame.award' } },
    ])
  })

  test('creates and updates Strila game state', () => {
    const state = createInitialGameState('strila-v2', { targetPointsBySeat: { A: 9, B: 9 }, breakerSeat: 'A' })

    expect(state).toEqual({
      score: { A: 0, B: 0 },
      targetPoints: { A: 9, B: 9 },
      coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
      cueBallSerialPots: null,
      foulOffender: null,
      winner: null,
      winReason: null,
      phase: 'open-play',
    })
  })

  test('derives Strila scoreboard projection', () => {
    expect(
      deriveGameProjection({
        gameKey: 'strila-v2',
        state: {
          score: { A: 2, B: 0 },
          targetPoints: { A: 9, B: 9 },
          coloredBallsOnTable: [2, 4, 7],
          cueBallSerialPots: null,
          foulOffender: null,
          winner: null,
          winReason: null,
          phase: 'open-play',
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
