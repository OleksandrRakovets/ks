import { expect, test } from 'bun:test'

import type { ProtocolEntry } from '@ks/competition'
import { type Control, newCommandId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { presentLastCommand } from './last-command-projection'

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
})
