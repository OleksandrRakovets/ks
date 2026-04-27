import { expect, test } from 'bun:test'

import type { StrilaFrameState } from '../definitions'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'
import { applyCommand } from './applyCommand'

test('simulation: internal: respotted black frame 1', () => {
  let next: StrilaFrameState = {
    score: { A: 0, B: 0 },
    targetPointsBySeat: { A: 9, B: 9 },
    coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
    cueBallPotsInRun: 0,
    chooser: null,
    offender: null,
    winner: null,
    winReason: null,
    phase: 'open-play',
  }

  ;({ next } = applyCommand(next, { type: 'pot.record', actor: 'A', pottedBalls: [1, 2] }))
  expect(next.score).toEqual({ A: 4, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([3, 4, 5, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallPotsInRun).toBe(0)

  ;({ next } = applyCommand(next, { type: 'pot.record', actor: 'A', pottedBalls: [3, 4] }))
  expect(next.score).toEqual({ A: 8, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([5, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallPotsInRun).toBe(0)

  ;({ next } = applyCommand(next, { type: 'foul.commit', actor: 'A' }))
  expect(next.phase).toBe('foul-committed.penalty-selection')
  expect(next.chooser).toBe('B')
  expect(next.offender).toBe('A')

  ;({ next } = applyCommand(next, {
    type: 'penalty.select',
    actor: 'B',
    choice: 'play-from-position',
  }))
  expect(next.score).toEqual({ A: 8, B: 1 })
  expect(next.phase).toBe('open-play')
  expect(next.cueBallPotsInRun).toBe(0)

  ;({ next } = applyCommand(next, { type: 'pot.record', actor: 'B', pottedBalls: [5, 6] }))
  expect(next.score).toEqual({ A: 8, B: 5 })
  expect(next.coloredBallsOnTable).toEqual([7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallPotsInRun).toBe(0)

  ;({ next } = applyCommand(next, { type: 'pot.record', actor: 'B', pottedBalls: [7] }))
  expect(next.score).toEqual({ A: 8, B: 7 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallPotsInRun).toBe(0)

  let protocolEntries
  ;({ next, protocolEntries } = applyCommand(next, { type: 'pot.record', actor: 'B', pottedBalls: [0] }))
  expect(next.score).toEqual({ A: 8, B: 8 })
  expect(next.coloredBallsOnTable).toEqual([7])
  expect(next.phase).toBe('respotted-black.opening')
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: { A: 8, B: 8 },
    details: {
      objectBalls: [7],
      ballsRemaining: [7],
      pointsAvailable: 2,
      phase: 'respotted-black.opening',
      winner: undefined,
    },
  })
  expect(protocolEntries).toEqual([
    { source: 'player', command: { type: 'pot.record', actor: 'B', pottedBalls: [0] } },
    { source: 'system', systemType: 'respotted-black-declared' },
  ])

  ;({ next, protocolEntries } = applyCommand(next, { type: 'pot.record', actor: 'A', pottedBalls: [7] }))
  expect(next.score).toEqual({ A: 10, B: 8 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toBe('winner-determined')
  expect(next.winner).toBe('A')
  expect(next.winReason).toBe('respotted-black-won')
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: { A: 10, B: 8 },
    details: {
      objectBalls: [],
      ballsRemaining: [],
      pointsAvailable: 2,
      phase: 'winner-determined',
      winner: 'A',
    },
  })
  expect(protocolEntries).toEqual([
    { source: 'player', command: { type: 'pot.record', actor: 'A', pottedBalls: [7] } },
    {
      source: 'system',
      systemType: 'winner-determined',
      winner: 'A',
      reason: 'respotted-black-won',
    },
  ])

  ;({ next } = applyCommand(next, { type: 'frame.award', actor: 'A' }))
  expect(next.score).toEqual({ A: 10, B: 8 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toBe('frame-over')
  expect(next.winner).toBe('A')
})
