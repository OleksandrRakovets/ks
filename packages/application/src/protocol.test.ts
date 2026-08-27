import { expect, test } from 'bun:test'

import { newCommandId, UnixEpochMillisecondsSchema } from '@ks/core'
import * as v from 'valibot'

import { deriveProtocolRows, prepareProtocolRowsForArchive } from './protocol'

const entry = {
  acceptedSeq: 1,
  entryIndex: 0,
  causedByCommandId: newCommandId(),
  acceptedAt: v.parse(UnixEpochMillisecondsSchema, 1),
  frameIndex: 1,
  source: 'system' as const,
  entryType: 'frame-prepared',
  seat: 'A' as const,
  bodyJson: JSON.stringify({ frameIndex: 1 }),
}

test('adapts normalized Protocol entries directly', () => {
  expect(prepareProtocolRowsForArchive([entry])).toEqual([
    expect.objectContaining({ rowNo: 1, frameIndex: 1, seat: 'A', body: { frameIndex: 1 } }),
  ])
  expect(deriveProtocolRows([entry], { A: 'Alice', B: 'Bob' }, 'UTC')[0]?.message.actor).toBe('Alice')
})
