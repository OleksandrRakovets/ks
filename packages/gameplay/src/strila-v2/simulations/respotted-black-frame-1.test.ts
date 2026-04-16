import { expect, test } from 'bun:test'

import type { StrilaFrameState } from '../definitions'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'
import { applyCommand } from './applyCommand'

test('simulation: internal: respotted black frame 1', () => {
  let next: StrilaFrameState = {
    score: { A: 0, B: 0 },
    targetPointsBySeat: { A: 9, B: 9 },
    coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
    phase: {
      type: 'open-play',
      actor: 'A',
      cueBallPotsInRun: 0,
    },
  }

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'A', pottedBalls: [1, 2] }))
  expect(next.score).toEqual({ A: 4, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([3, 4, 5, 6, 7])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'A',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'A', pottedBalls: [3, 4] }))
  expect(next.score).toEqual({ A: 8, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([5, 6, 7])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'A',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'foul-committed', actor: 'A' }))
  expect(next.phase).toEqual({
    type: 'foul-response',
    chooser: 'B',
    offender: 'A',
    forcedBallInHand: false,
  })

  ;({ next } = applyCommand(next, {
    type: 'choose-foul-response',
    actor: 'B',
    choice: 'play-from-position',
  }))
  expect(next.score).toEqual({ A: 8, B: 1 })
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'B',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'B', pottedBalls: [5, 6] }))
  expect(next.score).toEqual({ A: 8, B: 5 })
  expect(next.coloredBallsOnTable).toEqual([7])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'B',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'B', pottedBalls: [7] }))
  expect(next.score).toEqual({ A: 8, B: 7 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'B',
    cueBallPotsInRun: 0,
  })

  let protocolEntries
  ;({ next, protocolEntries } = applyCommand(next, { type: 'record-pot', actor: 'B', pottedBalls: [0] }))
  expect(next.score).toEqual({ A: 8, B: 8 })
  expect(next.coloredBallsOnTable).toEqual([7])
  expect(next.phase).toEqual({ type: 'respotted-black-opening', actor: 'B' })
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: { A: 8, B: 8 },
    details: {
      objectBalls: [7],
      ballsRemaining: [7],
      pointsAvailable: 2,
      phase: 'respotted-black-opening',
      winner: undefined,
    },
  })
  expect(protocolEntries).toEqual([
    { source: 'player', command: { type: 'record-pot', actor: 'B', pottedBalls: [0] } },
    { source: 'system', systemType: 'respotted-black-declared' },
  ])

  ;({ next, protocolEntries } = applyCommand(next, { type: 'record-pot', actor: 'A', pottedBalls: [7] }))
  expect(next.score).toEqual({ A: 10, B: 8 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toEqual({
    type: 'winner-determined',
    winner: 'A',
    actor: 'A',
    reason: 'respotted-black-won',
  })
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
    { source: 'player', command: { type: 'record-pot', actor: 'A', pottedBalls: [7] } },
    {
      source: 'system',
      systemType: 'winner-determined',
      winner: 'A',
      reason: 'respotted-black-won',
    },
  ])

  ;({ next } = applyCommand(next, { type: 'award-frame', actor: 'A' }))
  expect(next.score).toEqual({ A: 10, B: 8 })
  expect(next.coloredBallsOnTable).toEqual([])
  expect(next.phase).toEqual({
    type: 'frame-over',
    winner: 'A',
  })
})
