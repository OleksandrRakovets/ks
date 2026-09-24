import { expect, test } from 'bun:test'

import { FixedClock, newCommandId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { renderProtocolRows } from './protocol'

const clock = new FixedClock(new Date('2026-09-22T21:30:00Z'), 'Europe/Kyiv')

const entry = {
  gameKey: 'strila-v2',
  acceptedSeq: 1,
  entryIndex: 0,
  causedByCommandId: newCommandId(),
  acceptedAt: v.parse(UnixEpochMilliseconds, Date.parse('2026-09-22T21:15:00Z')),
  frameIndex: 1,
  source: 'system' as const,
  entryType: 'frame-prepared',
  seat: 'A' as const,
  body: {},
}

test('adapts normalized Protocol entries directly', () => {
  const row = renderProtocolRows([entry], { A: 'Alice', B: 'Bob' }, clock)[0]
  expect(row).toMatchObject({
    key: 'protocol-1-0',
    acceptedAtIso: '2026-09-22T21:15:00.000Z',
    acceptedAtLabel: '00:15',
    message: { actor: 'Alice', params: { frameIndex: '1' } },
  })
})

test('renders the dedicated table-cleared winner message', () => {
  const row = renderProtocolRows(
    [
      {
        ...entry,
        entryType: 'system-note',
        body: { systemType: 'winner-determined', reason: 'table-cleared' },
      },
    ],
    { A: 'Alice', B: 'Bob' },
    clock,
  )[0]

  expect(row?.message.key).toBe('match.protocol.system.winner-determined.table-cleared')
})

test('attributes the respotted-black opening selection to the chosen player', () => {
  const row = renderProtocolRows(
    [
      {
        ...entry,
        source: 'player',
        entryType: 'player-command',
        seat: 'B',
        body: { commandType: 'respotted-black.opening.select' },
      },
    ],
    { A: 'Alice', B: 'Bob' },
    clock,
  )[0]

  expect(row?.message).toEqual({
    key: 'match.protocol.commands.respotted-black.opening.select',
    actor: 'Bob',
  })
})
