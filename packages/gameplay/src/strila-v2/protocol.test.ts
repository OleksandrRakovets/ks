import { expect, test } from 'bun:test'

import type { StrilaCommand } from './definitions'
import { createInitialSnapshot, sendEvent } from './machine'
import { createStrilaProtocolEntries } from './protocol'

test('winning foul bonus records the updated score before the chooser winner note', () => {
  let previous = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  previous = sendEvent(previous, { type: 'pot.record', seat: 'B', pottedBalls: [1, 2, 3, 4] })
  previous = sendEvent(previous, { type: 'foul.commit', seat: 'A' })
  const command: StrilaCommand = { type: 'penalty.select', seat: 'B', choice: 'pass-position' }
  const next = sendEvent(previous, command)

  expect(createStrilaProtocolEntries({ previous, command, next })).toEqual([
    {
      gameKey: 'strila-v2',
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      scoreAfter: { A: 0, B: 9 },
      body: { commandType: 'penalty.select', choice: 'pass-position' },
    },
    {
      gameKey: 'strila-v2',
      source: 'system',
      entryType: 'system-note',
      seat: 'B',
      body: { systemType: 'winner-determined', reason: 'target-reached' },
    },
  ])
})

test('orders player entry before winner system note and records exact scoreAfter', () => {
  const previous = sendEvent(createInitialSnapshot({ A: 1, B: 9 }), { type: 'frame.commence', seat: 'A' })
  const command: StrilaCommand = { type: 'pot.record', seat: 'A', pottedBalls: [0] }
  const next = sendEvent(previous, command)

  expect(createStrilaProtocolEntries({ previous, command, next })).toEqual([
    {
      gameKey: 'strila-v2',
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 1, B: 0 },
      body: { commandType: 'pot.record', pottedBalls: [0] },
    },
    {
      gameKey: 'strila-v2',
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'winner-determined', reason: 'target-reached' },
    },
  ])
})

test('table-cleared Protocol attributes the pot to the shooter and the win to the leader', () => {
  let previous = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  previous = sendEvent(previous, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4] })
  previous = sendEvent(previous, { type: 'pot.record', seat: 'B', pottedBalls: [5, 6] })
  const command: StrilaCommand = { type: 'pot.record', seat: 'B', pottedBalls: [7] }
  const next = sendEvent(previous, command)

  expect(createStrilaProtocolEntries({ previous, command, next })).toEqual([
    {
      gameKey: 'strila-v2',
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      scoreAfter: { A: 8, B: 6 },
      body: { commandType: 'pot.record', pottedBalls: [7] },
    },
    {
      gameKey: 'strila-v2',
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'winner-determined', reason: 'table-cleared' },
    },
  ])
})

test.each([
  ['third-consecutive-cue-ball-pot', [0] as const],
  ['illegal-ball-in-hand-pot', [0, 3] as const],
] as const)('retains the %s automatic foul Protocol entry', (reason, pottedBalls) => {
  let previous = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), {
    type: 'frame.commence',
    seat: 'A',
  })

  if (reason === 'third-consecutive-cue-ball-pot') {
    previous = sendEvent(previous, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
    previous = sendEvent(previous, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
  } else {
    previous = sendEvent(previous, { type: 'foul.commit', seat: 'B' })
    previous = sendEvent(previous, { type: 'penalty.select', seat: 'A', choice: 'ball-in-hand' })
  }

  const command: StrilaCommand = { type: 'pot.record', seat: 'A', pottedBalls }
  const next = sendEvent(previous, command)

  expect(createStrilaProtocolEntries({ previous, command, next })).toEqual([
    {
      gameKey: 'strila-v2',
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      body: { commandType: 'pot.record', pottedBalls },
    },
    {
      gameKey: 'strila-v2',
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'automatic-foul', reason },
    },
  ])
})

test('records respotted-black declaration and the selected opening player', () => {
  let previous = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  previous = sendEvent(previous, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2] })
  previous = sendEvent(previous, { type: 'pot.record', seat: 'B', pottedBalls: [3, 4, 5, 6] })
  previous = sendEvent(previous, { type: 'foul.commit', seat: 'B' })
  previous = sendEvent(previous, { type: 'penalty.select', seat: 'A', choice: 'play-from-position' })

  const tyingPot: StrilaCommand = { type: 'pot.record', seat: 'A', pottedBalls: [0, 7] }
  const selection = sendEvent(previous, tyingPot)
  expect(createStrilaProtocolEntries({ previous, command: tyingPot, next: selection })).toEqual([
    {
      gameKey: 'strila-v2',
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 8, B: 8 },
      body: { commandType: 'pot.record', pottedBalls: [0, 7] },
    },
    {
      gameKey: 'strila-v2',
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'respotted-black-declared' },
    },
  ])

  const chooseOpener: StrilaCommand = { type: 'respotted-black.opening.select', seat: 'B' }
  const opening = sendEvent(selection, chooseOpener)
  expect(createStrilaProtocolEntries({ previous: selection, command: chooseOpener, next: opening })).toEqual([
    {
      gameKey: 'strila-v2',
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      body: { commandType: 'respotted-black.opening.select' },
    },
  ])
})
