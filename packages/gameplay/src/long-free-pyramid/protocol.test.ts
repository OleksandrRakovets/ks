import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from './machine'
import { projectLongFreePyramidProtocolEntries } from './protocol'

test('projects the exact ordered entry and total scoreAfter across rack state', () => {
  let previous = sendEvent(createInitialSnapshot({ targetPointsBySeat: { A: 30, B: 30 }, rackRollover: 14 }), {
    type: 'frame.commence',
    seat: 'A',
  })
  for (const points of [4, 4, 4] as const) previous = sendEvent(previous, { type: 'pot.record', seat: 'A', points })
  const command = { type: 'pot.record', seat: 'B', points: 2 } as const
  const next = sendEvent(previous, command)

  expect(projectLongFreePyramidProtocolEntries({ previous, command, next })).toEqual([
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      scoreAfter: { A: 12, B: 2 },
      body: { commandType: 'pot.record', points: 2 },
    },
  ])
})
