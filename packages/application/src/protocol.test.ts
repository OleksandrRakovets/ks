import { expect, test } from 'bun:test'

import { newCommandId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { renderProtocolRows } from './protocol'

const entry = {
  gameKey: 'strila-v2',
  acceptedSeq: 1,
  entryIndex: 0,
  causedByCommandId: newCommandId(),
  acceptedAt: v.parse(UnixEpochMilliseconds, 1),
  frameIndex: 1,
  source: 'system' as const,
  entryType: 'frame-prepared',
  seat: 'A' as const,
  body: {},
}

test('adapts normalized Protocol entries directly', () => {
  const row = renderProtocolRows([entry], { A: 'Alice', B: 'Bob' }, 'UTC')[0]
  expect(row).toMatchObject({
    key: 'protocol-1-0',
    acceptedAtIso: '1970-01-01T00:00:00.001Z',
    acceptedAtLabel: '00:00',
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
    'UTC',
  )[0]

  expect(row?.message.key).toBe('match.protocol.system.winner-determined.table-cleared')
})
