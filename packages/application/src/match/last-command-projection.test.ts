import { expect, test } from 'bun:test'

import type { ProtocolEntry } from '@ks/competition'
import { type Control, FixedClock, newCommandId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { presentLastCommand } from './last-command-projection'
import { renderProtocolRows } from './protocol-projection'

const clock = new FixedClock(new Date('2026-09-24T10:00:00Z'), 'Europe/Kyiv')

const acceptedAt = v.parse(UnixEpochMilliseconds, Date.parse('2026-09-24T10:00:00Z'))

const names = { A: 'Аня', B: 'Богдан' }

const originalId = newCommandId()

const pot: ProtocolEntry = {
  acceptedSeq: 3,
  entryIndex: 0,
  causedByCommandId: originalId,
  acceptedAt,
  frameIndex: 1,
  gameKey: 'strila-v2',
  source: 'player',
  entryType: 'player-command',
  seat: 'B',
  scoreAfter: { A: 2, B: 0 },
  body: { commandType: 'pot.record', pottedBalls: [0] },
}

const foul: ProtocolEntry = {
  ...pot,
  entryIndex: 1,
  source: 'system',
  entryType: 'system-note',
  body: { systemType: 'automatic-foul', reason: 'third-consecutive-cue-ball-pot' },
}

const correction: ProtocolEntry = {
  ...pot,
  acceptedSeq: 4,
  entryIndex: 1,
  causedByCommandId: newCommandId(),
  entryType: 'command-corrected',
  scoreAfter: { A: 2, B: 0 },
  body: { targetSeq: 3, targetCommandId: originalId, targetEntryIndex: 0 },
}

const foulCorrection: ProtocolEntry = {
  ...correction,
  entryIndex: 0,
  source: 'system',
  body: { targetSeq: 3, targetCommandId: originalId, targetEntryIndex: 1 },
}

const correctionControl: Control = {
  source: 'match',
  type: 'command.correct',
  fixedInput: { targetSeq: 3, targetCommandId: originalId },
  prominence: 'secondary',
}

test('targets the player command, not its later system entry', () => {
  expect(presentLastCommand({ entry: pot, correction: correctionControl }, names)).toMatchObject({
    message: { actor: 'Богдан', key: 'match.protocol.commands.pot.record.balls' },
    correction: correctionControl,
  })
})

test('renders the effective predecessor supplied by MatchRoom after compensation', () => {
  const earlier: ProtocolEntry = {
    ...pot,
    acceptedSeq: 2,
    causedByCommandId: newCommandId(),
    seat: 'A',
    scoreAfter: { A: 1, B: 0 },
  }

  expect(presentLastCommand({ entry: earlier }, names)).toMatchObject({
    message: { actor: 'Аня', key: 'match.protocol.commands.pot.record.balls' },
    score: { A: 1, B: 0 },
  })

  const rows = renderProtocolRows([pot, foul, correction], names, clock)
  expect(rows).toHaveLength(3)
  expect(rows[2]).toMatchObject({
    message: {
      key: 'match.protocol.commandCorrected',
      actor: 'Богдан',
      correctedEntry: { key: 'match.protocol.commands.pot.record.balls', pottedBalls: [0] },
    },
  })
})

test('links both correction entries to their own original without adding a stack step', () => {
  const earlier: ProtocolEntry = {
    ...pot,
    acceptedSeq: 2,
    causedByCommandId: newCommandId(),
    scoreAfter: { A: 1, B: 0 },
  }

  const entries = [earlier, pot, foul, foulCorrection, correction]

  const rows = renderProtocolRows(entries, names, clock)
  expect(rows[3]?.message).toMatchObject({
    key: 'match.protocol.commandCorrected',
    correctedEntry: { key: 'match.protocol.system.automatic-foul.third-consecutive-cue-ball-pot' },
  })
  expect(rows[3]?.message.actor).toBeUndefined()
  expect(rows[4]?.message).toMatchObject({
    actor: 'Богдан',
    correctedEntry: { key: 'match.protocol.commands.pot.record.balls' },
  })
})
