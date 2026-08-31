import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from '../machine'
import { deriveStrilaControlProjection } from './control'

test('projects exact open-play controls and selectable balls', () => {
  const snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  const control = deriveStrilaControlProjection(snapshot)

  expect(control).toMatchObject({
    gameKey: 'strila-v2',
    projection: 'control',
    score: { A: 0, B: 0 },
    details: {
      phase: 'open-play',
      situationTitle: 'Open play',
      situationSummary: 'Log pots or a foul.',
      isPotCommandAvailable: true,
      ballStatuses: {
        0: 'object',
        1: 'object',
        2: 'object',
        3: 'on-table',
        4: 'on-table',
        5: 'on-table',
        6: 'on-table',
        7: 'on-table',
      },
      pottedBallsBySeat: { A: [], B: [] },
      messages: [],
    },
  })
  expect(control.details.controlSections).toEqual({
    primary: {
      A: [{ source: 'game', type: 'pot.record', fixedInput: {}, seat: 'A', prominence: 'primary' }],
      B: [{ source: 'game', type: 'pot.record', fixedInput: {}, seat: 'B', prominence: 'primary' }],
    },
    secondary: {
      A: [{ source: 'game', type: 'foul.commit', fixedInput: {}, seat: 'A', prominence: 'secondary' }],
      B: [{ source: 'game', type: 'foul.commit', fixedInput: {}, seat: 'B', prominence: 'secondary' }],
    },
    tertiary: { A: [], B: [] },
    neutral: [],
  })

  // SAFETY: deliberately bypass readonly to verify the projection does not share machine state.
  const score = control.score as { A: number; B: number }
  // SAFETY: deliberately bypass readonly to verify the projection does not share machine state.
  const ballStatuses = control.details.ballStatuses as { 1: 'object' | 'on-table' | 'potted' }
  score.A = 99
  ballStatuses[1] = 'potted'
  expect(deriveStrilaControlProjection(snapshot).score.A).toBe(0)
  expect(deriveStrilaControlProjection(snapshot).details.ballStatuses[1]).toBe('object')
})

test('projects potted balls in acceptance order for each seat', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0, 1] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'B', pottedBalls: [2] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [3] })

  const control = deriveStrilaControlProjection(snapshot)
  expect(control.details.pottedBallsBySeat).toEqual({ A: [0, 1, 3], B: [2] })
  expect(control.details.pottedBallsBySeat.A).not.toBe(snapshot.context.pottedBallsBySeat.A)
  expect(control.details.pottedBallsBySeat.B).not.toBe(snapshot.context.pottedBallsBySeat.B)
})
