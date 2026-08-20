import { expect, test } from 'bun:test'

import { type StrilaFrameState, StrilaMeta } from '../definitions'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'
import { applyCommand } from './applyCommand'

test('simulation: runtime: respotted black frame 1', () => {
  let next: StrilaFrameState = {
    score: { A: 0, B: 0 },
    targetPoints: StrilaMeta.defaultTargetPoints,
    coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
    cueBallSerialPots: null,
    foulOffender: null,
    winner: null,
    winnerDeterminationReason: null,
    phase: 'open-play',
  }

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2] }))
  expect(next.score).toEqual({ A: 4, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([3, 4, 5, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [3, 4] }))
  expect(next.score).toEqual({ A: 8, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([5, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'foul.commit', seat: 'A' }))
  expect(next.phase).toBe('foul-committed.penalty-selection')
  expect(next.foulOffender).toBe('A')

  ;({ next } = applyCommand(next, {
    type: 'penalty.select',
    seat: 'B',
    choice: 'play-from-position',
  }))
  expect(next.score).toEqual({ A: 8, B: 1 })
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'B', pottedBalls: [5, 6] }))
  expect(next.score).toEqual({ A: 8, B: 5 })
  expect(next.coloredBallsOnTable).toEqual([7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'B', pottedBalls: [7] }))
  expect(next.score).toEqual({ A: 8, B: 7 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  let protocolEntries
  ;({ next, protocolEntries } = applyCommand(next, { type: 'pot.record', seat: 'B', pottedBalls: [0] }))
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
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      scoreAfter: { A: 8, B: 8 },
      body: { commandType: 'pot.record', pottedBalls: [0] },
    },
    { source: 'system', entryType: 'system-note', body: { systemType: 'respotted-black-declared' } },
  ])

  ;({ next, protocolEntries } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [7] }))
  expect(next.score).toEqual({ A: 10, B: 8 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toBe('winner-determined')
  expect(next.winner).toBe('A')
  expect(next.winnerDeterminationReason).toBe('respotted-black-won')
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
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 10, B: 8 },
      body: { commandType: 'pot.record', pottedBalls: [7] },
    },
    {
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'winner-determined', reason: 'respotted-black-won' },
    },
  ])

  ;({ next } = applyCommand(next, { type: 'frame.award', seat: 'A' }))
  expect(next.score).toEqual({ A: 10, B: 8 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toBe('frame-over')
  expect(next.winner).toBe('A')
})
