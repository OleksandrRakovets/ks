import { describe, expect, test } from 'bun:test'

import { createInitialGameState, deriveGameProjection } from '../gameplay'

describe('Strila game api', () => {
  test('creates initial Strila game state', () => {
    const state = createInitialGameState('strila-v2', { targetPointsBySeat: { A: 9, B: 9 }, breakerSeat: 'A' })

    expect(state).toEqual({
      score: { A: 0, B: 0 },
      targetPoints: { A: 9, B: 9 },
      coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
      cueBallSerialPots: null,
      foulOffender: null,
      winner: null,
      winnerDeterminationReason: null,
      phase: 'not-started',
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
          winnerDeterminationReason: null,
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
