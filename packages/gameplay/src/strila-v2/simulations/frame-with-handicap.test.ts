import { expect, test } from 'bun:test'

import { createInitialGameState } from '../../gameplay'
import { applyCommand } from './applyCommand'

test('simulation: runtime: handicap basic frame for A to 6', () => {
  let next = createInitialGameState('strila-v2', { targetPointsBySeat: { A: 6, B: 9 }, breakerSeat: 'A' })

  ;({ next } = applyCommand(next, {
    type: 'frame.commence',
    seat: 'A',
  }))
  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [1] }))
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [2] }))
  expect(next.phase).toBe('open-play')
  expect(next.cueBallSerialPots).toBeNull()

  ;({ next } = applyCommand(next, { type: 'pot.record', seat: 'A', pottedBalls: [3] }))
  expect(next.score).toEqual({ A: 6, B: 0 })
  expect(next.phase).toBe('winner-determined')
  expect(next.winner).toBe('A')
  expect(next.winnerDeterminationReason).toBe('target-reached')
})
