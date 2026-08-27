import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from './machine'
import { createPyramidProtocolEntries } from './protocol'
import { PyramidRuleSpecificsByGameKey } from './rules'

test('projects the exact ordered entry and scoreAfter for a foul', () => {
  const rules = PyramidRuleSpecificsByGameKey['free-pyramid']
  const previous = sendEvent(createInitialSnapshot(rules, { A: 8, B: 8 }), {
    type: 'frame.commence',
    seat: 'A',
  })
  const command = { type: 'foul.commit', seat: 'A' } as const
  const next = sendEvent(previous, command)

  expect(createPyramidProtocolEntries({ previous, command, next, rules })).toEqual([
    {
      gameKey: 'free-pyramid',
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 0, B: 1 },
      body: { commandType: 'foul.commit', penalty: 'opponent-plus-one' },
    },
  ])
})

test('projects pot.record with pottedBallCount and one score point per ball', () => {
  const rules = PyramidRuleSpecificsByGameKey['free-pyramid']
  const previous = sendEvent(createInitialSnapshot(rules, { A: 8, B: 8 }), {
    type: 'frame.commence',
    seat: 'A',
  })
  const command = { type: 'pot.record', seat: 'A', pottedBallCount: 2 } as const
  const next = sendEvent(previous, command)

  expect(createPyramidProtocolEntries({ previous, command, next, rules })).toEqual([
    {
      gameKey: 'free-pyramid',
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 2, B: 0 },
      body: { commandType: 'pot.record', pottedBallCount: 2 },
    },
  ])
})
