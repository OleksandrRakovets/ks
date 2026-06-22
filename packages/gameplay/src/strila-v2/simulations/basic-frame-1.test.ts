import { expect, test } from 'bun:test'

import { StrilaMeta } from '../definitions'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'
import { StrilaGameplayRuntime } from '../runtime'
import { applyCommand } from './applyCommand'

const runtime = new StrilaGameplayRuntime()

test('simulation: internal: basic frame 1', () => {
  let next = runtime.createInitialState({ targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })

  ;({ next } = applyCommand(next, {
    type: 'frame.commence',
    seat: 'A',
  }))
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: { A: 0, B: 0 },
    details: {
      objectBalls: [1, 2],
      ballsRemaining: [1, 2, 3, 4, 5, 6, 7],
      pointsAvailable: 14,
      phase: 'open-play',
      winner: undefined,
    },
  })

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [1] }))
  expect(next.score).toEqual({ A: 2, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [0] }))
  expect(next.score).toEqual({ A: 3, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toEqual({ seat: 'A', count: 1 })

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [0] }))
  expect(next.score).toEqual({ A: 4, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toEqual({ seat: 'A', count: 2 })

  let protocolEntries
  ;({ next, protocolEntries } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [0] }))
  expect(next.score).toEqual({ A: 4, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  expect(next.phase).toBe('foul-committed.penalty-selection')
  expect(next.foulOffender).toBe('A')
  expect(protocolEntries).toEqual([
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      body: { commandType: 'pot.record', pottedBalls: [0] },
    },
    {
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'automatic-foul', reason: 'third-consecutive-cue-ball-pot' },
    },
  ])

  ;({ next } = applyCommand(next, {
    type: 'penalty.select',
    seat: 'B',
    choice: 'play-from-position',
  }))
  expect(next.score).toEqual({ A: 4, B: 1 })
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'B', pottedBalls: [2, 3] }))
  expect(next.score).toEqual({ A: 4, B: 5 })
  expect(next.coloredBallsOnTable).toEqual([4, 5, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'B', pottedBalls: [5] }))
  expect(next.score).toEqual({ A: 4, B: 7 })
  expect(next.coloredBallsOnTable).toEqual([4, 6, 7])
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next, protocolEntries } = applyCommand(next, { type: 'pot.record', seat: 'B', pottedBalls: [4] }))
  expect(next.score).toEqual({ A: 4, B: 9 })
  expect(next.coloredBallsOnTable).toEqual([6, 7])
  expect(next.phase).toBe('winner-determined')
  expect(next.winner).toBe('B')
  expect(next.winReason).toBe('target-reached')
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: { A: 4, B: 9 },
    details: {
      objectBalls: [6],
      ballsRemaining: [6, 7],
      pointsAvailable: 4,
      phase: 'winner-determined',
      winner: 'B',
    },
  })
  expect(protocolEntries).toEqual([
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      scoreAfter: { A: 4, B: 9 },
      body: { commandType: 'pot.record', pottedBalls: [4] },
    },
    {
      source: 'system',
      entryType: 'system-note',
      seat: 'B',
      body: { systemType: 'winner-determined', reason: 'target-reached' },
    },
  ])

  ;({ next } = applyCommand(next, { type: 'frame.award', seat: 'B' }))
  expect(next.score).toEqual({ A: 4, B: 9 })
  expect(next.coloredBallsOnTable).toEqual([6, 7])
  expect(next.phase).toBe('frame-over')
  expect(next.winner).toBe('B')
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: { A: 4, B: 9 },
    details: {
      objectBalls: [6],
      ballsRemaining: [6, 7],
      pointsAvailable: 4,
      phase: 'frame-over',
      winner: 'B',
    },
  })
})
