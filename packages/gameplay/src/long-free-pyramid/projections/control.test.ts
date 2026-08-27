import { expect, test } from 'bun:test'

import { createInitialSnapshot, LongFreePyramidSparringFrameMachine, sendEvent } from '../machine'
import { deriveLongFreePyramidControlProjection } from './control'

test('projects presentation and limits selectable pots to balls remaining', () => {
  let snapshot = sendEvent(createInitialSnapshot({ targetPointsBySeat: { A: 30, B: 30 }, rackRollover: 15 }), {
    type: 'frame.commence',
    seat: 'A',
  })
  snapshot = LongFreePyramidSparringFrameMachine.resolveState({
    ...snapshot,
    context: { ...snapshot.context, racks: [{ rackNumber: 1, scoreBySeat: { A: 14, B: 0 } }] },
  })

  const control = deriveLongFreePyramidControlProjection(snapshot)
  expect(control).toMatchObject({
    gameKey: 'free-pyramid-long',
    projection: 'control',
    score: { A: 14, B: 0 },
    details: { phase: 'open-play', ballsRemoved: 14, ballsOnTable: 2, isPotCommandAvailable: true },
  })
  expect(control.details.controlSections.primary).toEqual({
    A: [
      {
        source: 'game',
        type: 'pot.record',
        fixedInput: { pottedBallCount: 1 },
        seat: 'A',
        prominence: 'primary',
      },
    ],
    B: [
      {
        source: 'game',
        type: 'pot.record',
        fixedInput: { pottedBallCount: 1 },
        seat: 'B',
        prominence: 'primary',
      },
    ],
  })
  expect(control.details.controlSections.secondary.A.map((entry) => entry.fixedInput)).toEqual([
    { pottedBallCount: 2 },
    {},
  ])

  control.details.rackHistory[0]!.scoreBySeat.A = 99
  expect(deriveLongFreePyramidControlProjection(snapshot).details.rackHistory[0]!.scoreBySeat.A).toBe(14)
})
