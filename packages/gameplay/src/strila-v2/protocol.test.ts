import { expect, test } from 'bun:test'

import type { StrilaCommand } from './definitions'
import { createInitialSnapshot, sendEvent } from './machine'
import { projectStrilaProtocolEntries } from './protocol'

test('orders player entry before winner system note and records exact scoreAfter', () => {
  const previous = sendEvent(createInitialSnapshot({ A: 1, B: 9 }), { type: 'frame.commence', seat: 'A' })
  const command: StrilaCommand = { type: 'pot.record', seat: 'A', pottedBalls: [0] }
  const next = sendEvent(previous, command)

  expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 1, B: 0 },
      body: { commandType: 'pot.record', pottedBalls: [0] },
    },
    {
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'winner-determined', reason: 'target-reached' },
    },
  ])
})
