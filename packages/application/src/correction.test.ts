import { expect, test } from 'bun:test'

import { FixedClock, newCommandId, type ProtocolEntry, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { renderLastActionRow, renderProtocolRows } from './protocol'

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
  causedByCommandId: newCommandId(),
  entryType: 'action-corrected',
  scoreAfter: { A: 2, B: 0 },
  body: { targetSeq: 3, targetCommandId: originalId },
}

const indexedCorrection: ProtocolEntry = {
  ...correction,
  body: { targetSeq: 3, targetCommandId: originalId, targetEntryIndex: 0 },
}

const foulCorrection: ProtocolEntry = {
  ...correction,
  entryIndex: 1,
  source: 'system',
  body: { targetSeq: 3, targetCommandId: originalId, targetEntryIndex: 1 },
}

test('targets the player action, not its later system entry', () => {
  expect(renderLastActionRow([pot, foul], names, 3)).toMatchObject({
    message: { actor: 'Богдан', key: 'match.protocol.commands.pot.record.balls' },
    target: { acceptedSeq: 3, commandId: originalId },
  })
})

test('shows the preceding uncorrected action after compensation', () => {
  const earlier: ProtocolEntry = {
    ...pot,
    acceptedSeq: 2,
    causedByCommandId: newCommandId(),
    seat: 'A',
    scoreAfter: { A: 1, B: 0 },
  }

  expect(renderLastActionRow([earlier, pot, foul, correction], names, 4)).toMatchObject({
    message: { actor: 'Аня', key: 'match.protocol.commands.pot.record.balls' },
    score: { A: 1, B: 0 },
    target: { acceptedSeq: 2, commandId: earlier.causedByCommandId },
  })
  expect(renderLastActionRow([pot, foul, correction], names, 4)?.target).toBeUndefined()

  const earlierCorrection: ProtocolEntry = {
    ...correction,
    acceptedSeq: 5,
    body: { targetSeq: 2, targetCommandId: earlier.causedByCommandId },
  }

  expect(renderLastActionRow([earlier, pot, foul, correction, earlierCorrection], names, 5)).toBeUndefined()

  const rows = renderProtocolRows([pot, foul, correction], names, clock)
  expect(rows).toHaveLength(3)
  expect(rows[2]).toMatchObject({
    message: {
      key: 'match.protocol.actionCorrected',
      actor: 'Богдан',
      correctedAction: { key: 'match.protocol.commands.pot.record.balls', pottedBalls: [0] },
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

  const entries = [earlier, pot, foul, indexedCorrection, foulCorrection]

  expect(renderLastActionRow(entries, names, 4)?.target).toEqual({
    acceptedSeq: 2,
    commandId: earlier.causedByCommandId,
  })
  const rows = renderProtocolRows(entries, names, clock)
  expect(rows[3]?.message).toMatchObject({
    actor: 'Богдан',
    correctedAction: { key: 'match.protocol.commands.pot.record.balls' },
  })
  expect(rows[4]?.message).toMatchObject({
    key: 'match.protocol.actionCorrected',
    correctedAction: { key: 'match.protocol.system.automatic-foul.third-consecutive-cue-ball-pot' },
  })
  expect(rows[4]?.message.actor).toBeUndefined()
})

test('does not target a stale action or frame lifecycle entry', () => {
  expect(renderLastActionRow([pot, foul], names, 2)).toBeUndefined()

  const award: ProtocolEntry = {
    ...pot,
    acceptedSeq: 4,
    causedByCommandId: newCommandId(),
    body: { commandType: 'frame.award' },
  }

  expect(renderLastActionRow([pot, foul, award], names, 4)?.target).toBeUndefined()

  const commence: ProtocolEntry = {
    ...pot,
    acceptedSeq: 2,
    causedByCommandId: newCommandId(),
    body: { commandType: 'frame.commence' },
  }

  expect(renderLastActionRow([commence], names, 2)?.target).toBeUndefined()
})
