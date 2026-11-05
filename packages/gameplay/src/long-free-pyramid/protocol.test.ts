import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from './machine'
import { createLongFreePyramidFrameEndProtocolEntries, createLongFreePyramidProtocolEntries } from './protocol'

function commenced(targetPoints = 30) {
  return sendEvent(
    createInitialSnapshot({ targetPointsBySeat: { A: targetPoints, B: 30 }, rackRollover: 14 }),
    {
      type: 'frame.commence',
      seat: 'A',
    },
  )
}

test('the rollover command records the completed rack after its own entry, not the empty next rack', () => {
  let previous = commenced()

  for (const pottedBallCount of [4, 4, 4] as const)
    previous = sendEvent(previous, { type: 'pot.record', seat: 'A', pottedBallCount })
  const command = { type: 'pot.record', seat: 'B', pottedBallCount: 2 } as const
  const next = sendEvent(previous, command)

  expect(createLongFreePyramidProtocolEntries({ previous, command, next })).toEqual([
    {
      gameKey: 'free-pyramid-long',
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      scoreAfter: { A: 12, B: 2 },
      body: { commandType: 'pot.record', pottedBallCount: 2 },
    },
    {
      gameKey: 'free-pyramid-long',
      source: 'system',
      entryType: 'system-note',
      seat: 'B',
      body: { systemType: 'rack-completed', rackNumber: 1, scoreBySeat: { A: 12, B: 2 } },
    },
  ])
})

test('a command that leaves the rack below rollover records no rack result', () => {
  const previous = commenced()
  const command = { type: 'foul.commit', seat: 'A' } as const
  const next = sendEvent(previous, command)

  expect(createLongFreePyramidProtocolEntries({ previous, command, next })).toHaveLength(1)
})

test('the frame end records only a partially cleared final rack', () => {
  let rolled = commenced(14)

  for (const pottedBallCount of [4, 4, 4] as const)
    rolled = sendEvent(rolled, { type: 'pot.record', seat: 'A', pottedBallCount })
  rolled = sendEvent(rolled, { type: 'pot.record', seat: 'A', pottedBallCount: 2 })

  expect(createLongFreePyramidFrameEndProtocolEntries(rolled, 'A')).toEqual([])

  const partial = sendEvent(rolled, { type: 'pot.record', seat: 'A', pottedBallCount: 3 })

  expect(createLongFreePyramidFrameEndProtocolEntries(partial, 'A')).toEqual([
    {
      gameKey: 'free-pyramid-long',
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'rack-completed', rackNumber: 2, scoreBySeat: { A: 3, B: 0 } },
    },
  ])
})
