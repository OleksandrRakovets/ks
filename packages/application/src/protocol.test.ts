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
  expect(row).toMatchObject({ key: 'protocol-1-0', message: { actor: 'Alice', params: { frameIndex: '1' } } })
})
