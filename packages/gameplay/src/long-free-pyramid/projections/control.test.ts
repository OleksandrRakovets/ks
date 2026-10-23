import { expect, test } from 'bun:test'

import { groupControlsIntoSections } from '@ks/core'

import { createInitialSnapshot, LongFreePyramidFrameMachine, sendEvent } from '../machine'
import { deriveLongFreePyramidControlProjection } from './control'

test('projects presentation and limits selectable pots to balls remaining', () => {
  let snapshot = sendEvent(createInitialSnapshot({ targetPointsBySeat: { A: 30, B: 30 }, rackRollover: 15 }), {
    type: 'frame.commence',
    seat: 'A',
  })

  snapshot = LongFreePyramidFrameMachine.resolveState({
    ...snapshot,
    context: { ...snapshot.context, racks: [{ rackNumber: 1, scoreBySeat: { A: 14, B: 0 } }] },
  })

  const controlProjection = deriveLongFreePyramidControlProjection(snapshot)
  expect(controlProjection.game).toMatchObject({
    gameKey: 'free-pyramid-long',
    score: { A: 14, B: 0 },
    details: { phase: 'open-play', ballsRemoved: 14, ballsOnTable: 2, isPotCommandAvailable: true },
  })
  const sections = groupControlsIntoSections(controlProjection.controls)
  expect(sections.primary).toEqual({
    A: [
      {
        source: 'game',
        type: 'pot.record',
        fixedInput: { pottedBallCount: 1 },
        seat: 'A',
        prominence: 'primary',
      },
      {
        source: 'game',
        type: 'pot.record',
        fixedInput: { pottedBallCount: 2 },
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
      {
        source: 'game',
        type: 'pot.record',
        fixedInput: { pottedBallCount: 2 },
        seat: 'B',
        prominence: 'primary',
      },
    ],
  })
  expect(sections.secondary.A.map((entry) => entry.fixedInput)).toEqual([{}])

  // SAFETY: deliberately bypass readonly to verify the projection does not share machine state.
  const historicalScore = controlProjection.game.details.rackHistory[0]!.scoreBySeat as {
    A: number
    B: number
  }

  historicalScore.A = 99
  expect(deriveLongFreePyramidControlProjection(snapshot).game.details.rackHistory[0]!.scoreBySeat.A).toBe(14)
})

test('projects rack history and the rack-started message after a rollover', () => {
  let snapshot = sendEvent(createInitialSnapshot({ targetPointsBySeat: { A: 30, B: 30 }, rackRollover: 14 }), {
    type: 'frame.commence',
    seat: 'A',
  })

  for (const pottedBallCount of [4, 4, 4, 2] as const) {
    snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBallCount })
  }

  expect(deriveLongFreePyramidControlProjection(snapshot).game).toMatchObject({
    score: { A: 14, B: 0 },
    details: {
      ballsOnTable: 16,
      rackHistory: [
        { rackNumber: 1, scoreBySeat: { A: 14, B: 0 } },
        { rackNumber: 2, scoreBySeat: { A: 0, B: 0 } },
      ],
      messages: [{ code: 'rack-started', rackNumber: 2 }],
    },
  })
})
