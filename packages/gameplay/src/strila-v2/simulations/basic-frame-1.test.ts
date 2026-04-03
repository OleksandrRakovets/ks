import { expect, test } from 'bun:test'

import type { StrilaCommand, StrilaFrameState } from '../definitions'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'
import { projectStrilaProtocolEntries } from '../protocol'
import { createEmptyStrilaFrameState, reduceStrilaCommand } from '../reducer'

function applyCommand(previous: StrilaFrameState, command: StrilaCommand) {
  const next = reduceStrilaCommand(previous, command)
  const protocolEntries = projectStrilaProtocolEntries({ previous, command, next })
  return { next, protocolEntries }
}

test('simulation: internal: basic frame 1', () => {
  let next = createEmptyStrilaFrameState()

  ;({ next } = applyCommand(next, {
    type: 'break-off',
    actor: 'A',
  }))
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'A',
    cueBallPotsInRun: 0,
  })
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    score: { A: 0, B: 0 },
    objectBalls: [1, 2],
    ballsRemaining: [1, 2, 3, 4, 5, 6, 7],
    pointsAvailable: 14,
    phase: 'open-play',
  })

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'A', pottedBalls: [1] }))
  expect(next.score).toEqual({ A: 2, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'A',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'A', pottedBalls: [0] }))
  expect(next.score).toEqual({ A: 3, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'A',
    cueBallPotsInRun: 1,
  })

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'A', pottedBalls: [0] }))
  expect(next.score).toEqual({ A: 4, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'A',
    cueBallPotsInRun: 2,
  })

  let protocolEntries
  ;({ next, protocolEntries } = applyCommand(next, { type: 'record-pot', actor: 'A', pottedBalls: [0] }))
  expect(next.score).toEqual({ A: 4, B: 0 })
  expect(next.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  expect(next.phase).toEqual({
    type: 'foul-response',
    chooser: 'B',
    offender: 'A',
    forcedBallInHand: false,
  })
  expect(protocolEntries).toEqual([
    { source: 'player', command: { type: 'record-pot', actor: 'A', pottedBalls: [0] } },
    {
      source: 'system',
      systemType: 'automatic-foul',
      offender: 'A',
      reason: 'third-consecutive-cue-ball-pot',
    },
  ])

  ;({ next } = applyCommand(next, {
    type: 'choose-foul-response',
    actor: 'B',
    choice: 'play-from-position',
  }))
  expect(next.score).toEqual({ A: 4, B: 1 })
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'B',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'B', pottedBalls: [2, 3] }))
  expect(next.score).toEqual({ A: 4, B: 5 })
  expect(next.coloredBallsOnTable).toEqual([4, 5, 6, 7])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'B',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'record-pot', actor: 'B', pottedBalls: [5] }))
  expect(next.score).toEqual({ A: 4, B: 7 })
  expect(next.coloredBallsOnTable).toEqual([4, 6, 7])
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'B',
    cueBallPotsInRun: 0,
  })

  ;({ next, protocolEntries } = applyCommand(next, { type: 'record-pot', actor: 'B', pottedBalls: [4] }))
  expect(next.score).toEqual({ A: 4, B: 9 })
  expect(next.coloredBallsOnTable).toEqual([6, 7])
  expect(next.phase).toEqual({
    type: 'winner-determined',
    winner: 'B',
    actor: 'B',
    reason: 'target-reached',
  })
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    score: { A: 4, B: 9 },
    objectBalls: [6],
    ballsRemaining: [6, 7],
    pointsAvailable: 4,
    phase: 'winner-determined',
    winner: 'B',
  })
  expect(protocolEntries).toEqual([
    { source: 'player', command: { type: 'record-pot', actor: 'B', pottedBalls: [4] } },
    {
      source: 'system',
      systemType: 'winner-determined',
      winner: 'B',
      reason: 'target-reached',
    },
  ])

  ;({ next } = applyCommand(next, { type: 'award-frame', actor: 'B' }))
  expect(next.score).toEqual({ A: 4, B: 9 })
  expect(next.coloredBallsOnTable).toEqual([6, 7])
  expect(next.phase).toEqual({
    type: 'frame-over',
    winner: 'B',
  })
  expect(deriveStrilaScoreboardView(next)).toEqual({
    gameKey: 'strila-v2',
    score: { A: 4, B: 9 },
    objectBalls: [6],
    ballsRemaining: [6, 7],
    pointsAvailable: 4,
    phase: 'frame-over',
    winner: 'B',
  })
})
