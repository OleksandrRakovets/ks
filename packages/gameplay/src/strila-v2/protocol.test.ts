import { expect, test } from 'bun:test'

import type { StrilaCommand } from './definitions'
import { createInitialSnapshot, sendEvent } from './machine'
import { createStrilaProtocolEntries } from './protocol'

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
