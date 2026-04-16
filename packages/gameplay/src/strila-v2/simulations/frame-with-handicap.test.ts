import { test, expect } from 'bun:test'

import { createEmptyStrilaFrameState } from '../reducer'
import { applyCommand } from './applyCommand'

test('simulation: internal: handicap basic frame for A to 6', () => {
  let next = createEmptyStrilaFrameState({ A: 6, B: 9 })

  ;({ next } = applyCommand(next, {
    type: 'frame.commence',
    actor: 'A',
  }))
  ;({ next } = applyCommand(next, { type: 'pot.record', actor: 'A', pottedBalls: [1] }))
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'A',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'pot.record', actor: 'A', pottedBalls: [2] }))
  expect(next.phase).toEqual({
    type: 'open-play',
    actor: 'A',
    cueBallPotsInRun: 0,
  })

  ;({ next } = applyCommand(next, { type: 'pot.record', actor: 'A', pottedBalls: [3] }))
  expect(next.score).toEqual({ A: 6, B: 0 })
  expect(next.phase).toEqual({
    type: 'winner-determined',
    winner: 'A',
    actor: 'A',
    reason: 'target-reached',
  })
})
