import { expect, test } from 'bun:test'

import { groupControlsIntoSections } from '@ks/core'

import { createInitialSnapshot, sendEvent } from '../machine'
import { deriveStrilaControlProjection } from './control'

test('projects every break-off ball as an object in a visible, non-selectable set', () => {
  const projection = deriveStrilaControlProjection(createInitialSnapshot({ A: 9, B: 9 }))

  expect(projection.game.details).toMatchObject({
    phase: 'not-started',
    isBallSetVisible: true,
    isPotCommandAvailable: false,
    ballStatuses: {
      0: 'object',
      1: 'object',
      2: 'object',
      3: 'object',
      4: 'object',
      5: 'object',
      6: 'object',
      7: 'object',
    },
  })
  expect(projection.controls).toEqual([])
})

test('projects exact open-play controls and selectable balls', () => {
  const snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  const controlProjection = deriveStrilaControlProjection(snapshot)

  expect(controlProjection.game).toMatchObject({
    gameKey: 'strila-v2',
    score: { A: 0, B: 0 },
    details: {
      phase: 'open-play',
      situationTitle: 'Open play',
      situationSummary: 'Log pots or a foul.',
      isBallSetVisible: true,
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
      ruleNotes: [],
    },
  })
  expect(groupControlsIntoSections(controlProjection.controls)).toEqual({
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
  const score = controlProjection.game.score as { A: number; B: number }
  // SAFETY: deliberately bypass readonly to verify the projection does not share machine state.
  const ballStatuses = controlProjection.game.details.ballStatuses as { 1: 'object' | 'on-table' | 'potted' }
  score.A = 99
  ballStatuses[1] = 'potted'
  expect(deriveStrilaControlProjection(snapshot).game.score.A).toBe(0)
  expect(deriveStrilaControlProjection(snapshot).game.details.ballStatuses[1]).toBe('object')
})

test('projects open-play miss controls only after two consecutive cue-ball pots', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), {
    type: 'frame.commence',
    seat: 'A',
  })

  expect(deriveStrilaControlProjection(snapshot).controls.some(({ type }) => type === 'miss.record')).toBe(
    false,
  )

  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
  expect(deriveStrilaControlProjection(snapshot).controls.some(({ type }) => type === 'miss.record')).toBe(
    false,
  )

  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
  const projection = deriveStrilaControlProjection(snapshot)
  expect(projection.controls.filter(({ type }) => type === 'miss.record')).toEqual([
    { source: 'game', type: 'miss.record', fixedInput: {}, seat: 'A', prominence: 'secondary' },
    { source: 'game', type: 'miss.record', fixedInput: {}, seat: 'B', prominence: 'secondary' },
  ])

  snapshot = sendEvent(snapshot, { type: 'miss.record', seat: 'B' })
  expect(deriveStrilaControlProjection(snapshot).controls.some(({ type }) => type === 'miss.record')).toBe(
    false,
  )
})

test('projects all manual foul responses', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), {
    type: 'frame.commence',
    seat: 'A',
  })

  snapshot = sendEvent(snapshot, { type: 'foul.commit', seat: 'A' })

  const projection = deriveStrilaControlProjection(snapshot)
  expect(projection.controls.map(({ type, seat, fixedInput }) => ({ type, seat, fixedInput }))).toEqual([
    { type: 'penalty.select', seat: 'B', fixedInput: { choice: 'play-from-position' } },
    { type: 'penalty.select', seat: 'B', fixedInput: { choice: 'pass-position' } },
    { type: 'penalty.select', seat: 'B', fixedInput: { choice: 'ball-in-hand' } },
  ])
})

test.each(['foul-committed.ball-in-hand', 'respotted-black.opening'] as const)(
  'retains miss controls in special phase %s',
  (phase) => {
    let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), {
      type: 'frame.commence',
      seat: 'A',
    })

    if (phase === 'foul-committed.ball-in-hand') {
      snapshot = sendEvent(snapshot, { type: 'foul.commit', seat: 'A' })
      snapshot = sendEvent(snapshot, { type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' })
    } else {
      snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2] })
      snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'B', pottedBalls: [3, 4, 5, 6] })
      snapshot = sendEvent(snapshot, { type: 'foul.commit', seat: 'B' })
      snapshot = sendEvent(snapshot, { type: 'penalty.select', seat: 'A', choice: 'play-from-position' })
      snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0, 7] })
    }

    expect(
      deriveStrilaControlProjection(snapshot).controls.filter(({ type }) => type === 'miss.record'),
    ).toEqual([
      { source: 'game', type: 'miss.record', fixedInput: {}, seat: 'A', prominence: 'secondary' },
      { source: 'game', type: 'miss.record', fixedInput: {}, seat: 'B', prominence: 'secondary' },
    ])
  },
)

test('projects potted balls in acceptance order for each seat', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0, 1] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'B', pottedBalls: [2] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [3] })

  const controlProjection = deriveStrilaControlProjection(snapshot)
  expect(controlProjection.game.details.pottedBallsBySeat).toEqual({ A: [0, 1, 3], B: [2] })
  expect(controlProjection.game.details.pottedBallsBySeat).toBe(snapshot.context.pottedBallsBySeat)
})

test.each([false, true])(
  'contrasts table-cleared and target winner controls (table cleared: %s)',
  (cleared) => {
    let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
    snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4] })
    snapshot = sendEvent(
      snapshot,
      cleared
        ? { type: 'pot.record', seat: 'B', pottedBalls: [5, 6, 7] }
        : { type: 'pot.record', seat: 'A', pottedBalls: [5] },
    )
    const projection = deriveStrilaControlProjection(snapshot)
    expect(projection.game.details.isPotCommandAvailable).toBe(!cleared)
    expect(projection.controls.map(({ type, seat }) => ({ type, seat }))).toEqual(
      cleared
        ? [{ type: 'frame.award', seat: 'A' }]
        : [
            { type: 'pot.record', seat: 'A' },
            { type: 'frame.award', seat: 'A' },
          ],
    )
  },
)

test('projects only award after a bonus determines the winner', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 1, B: 9 }), { type: 'frame.commence', seat: 'A' })
  snapshot = sendEvent(snapshot, { type: 'foul.commit', seat: 'B' })
  snapshot = sendEvent(snapshot, {
    type: 'penalty.select',
    seat: 'A',
    choice: 'play-from-position',
  })

  const projection = deriveStrilaControlProjection(snapshot)
  expect(projection.controls.map(({ type, seat }) => ({ type, seat }))).toEqual([
    { type: 'frame.award', seat: 'A' },
  ])
  expect(projection.game.details.situationSummary).toBe('The frame can be awarded now.')
})

test('projects only award after a respotted-black pot determines the winner', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'B', pottedBalls: [3, 4, 5, 6] })
  snapshot = sendEvent(snapshot, { type: 'foul.commit', seat: 'B' })
  snapshot = sendEvent(snapshot, { type: 'penalty.select', seat: 'A', choice: 'play-from-position' })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0, 7] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [7] })

  const projection = deriveStrilaControlProjection(snapshot)
  expect(projection.controls.map(({ type, seat }) => ({ type, seat }))).toEqual([
    { type: 'frame.award', seat: 'A' },
  ])
  expect(projection.game.details.situationSummary).toBe('The frame can be awarded now.')
})
