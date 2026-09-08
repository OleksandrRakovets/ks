import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from '../machine'
import { deriveStrilaRuleNotes } from './rule-notes'

test('shows the relevant cue-ball warning while resolving a manual foul', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), {
    type: 'frame.commence',
    seat: 'A',
  })
  snapshot = sendEvent(snapshot, { type: 'foul.commit', seat: 'A' })
  expect(deriveStrilaRuleNotes(snapshot)).toEqual([
    { severity: 'warning', code: 'manual-foul-cue-ball-response' },
  ])

  snapshot = sendEvent(snapshot, { type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' })
  expect(deriveStrilaRuleNotes(snapshot)).toEqual([
    { severity: 'warning', code: 'cue-ball-and-colored-is-foul' },
  ])
})

test('warns the affected player before a third consecutive cue-ball pot', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), {
    type: 'frame.commence',
    seat: 'A',
  })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0] })

  expect(deriveStrilaRuleNotes(snapshot)).toContainEqual({
    severity: 'warning',
    code: 'third-consecutive-cue-ball-pot',
    seat: 'A',
  })
})

test('projects warning and information outcomes from last-colored-ball transitions', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), {
    type: 'frame.commence',
    seat: 'A',
  })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'B', pottedBalls: [3, 4, 5, 6] })

  expect(deriveStrilaRuleNotes(snapshot)).toEqual([
    {
      severity: 'warning',
      code: 'last-colored-ball-pot-outcomes',
      ball: 7,
      outcomes: [
        {
          seat: 'A',
          result: { type: 'winner-determined', winnerSeat: 'B' },
        },
      ],
    },
    {
      severity: 'info',
      code: 'last-colored-ball-pot-outcomes',
      ball: 7,
      outcomes: [
        {
          seat: 'B',
          result: { type: 'winner-determined', winnerSeat: 'B' },
        },
      ],
    },
  ])
})

test('combines same-severity last-colored-ball outcomes into one note', () => {
  let snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), {
    type: 'frame.commence',
    seat: 'A',
  })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0, 1] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [0, 2] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'A', pottedBalls: [3] })
  snapshot = sendEvent(snapshot, { type: 'pot.record', seat: 'B', pottedBalls: [4, 5, 6] })

  expect(deriveStrilaRuleNotes(snapshot)).toEqual([
    {
      severity: 'info',
      code: 'last-colored-ball-pot-outcomes',
      ball: 7,
      outcomes: [
        {
          seat: 'A',
          result: { type: 'winner-determined', winnerSeat: 'A' },
        },
        { seat: 'B', result: { type: 'respotted-black' } },
      ],
    },
  ])
})
