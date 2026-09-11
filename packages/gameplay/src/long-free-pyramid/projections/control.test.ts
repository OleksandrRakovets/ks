import { expect, test } from 'bun:test'

import { groupControlsIntoSections } from '@ks/core'

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
  expect(sections.secondary.A.map((entry) => entry.fixedInput)).toEqual([{ pottedBallCount: 2 }, {}])

  // SAFETY: deliberately bypass readonly to verify the projection does not share machine state.
  const historicalScore = controlProjection.game.details.rackHistory[0]!.scoreBySeat as {
    A: number
    B: number
  }

  historicalScore.A = 99
  expect(deriveLongFreePyramidControlProjection(snapshot).game.details.rackHistory[0]!.scoreBySeat.A).toBe(14)
})
