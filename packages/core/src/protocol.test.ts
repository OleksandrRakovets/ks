import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { CommandIdSchema } from './ids'
import { ProtocolEntrySchema, StoredProtocolEntrySchema } from './protocol'
import { AcceptedCommandStreamUpdateSchema } from './wire'

const commandId = v.parse(CommandIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAB')
const semantic = {
  frameIndex: 1,
  source: 'system' as const,
  entryType: 'frame-prepared',
  seat: 'A' as const,
  body: { breaker: true },
}

describe('Protocol contracts', () => {
  test('requires a focal seat on every semantic entry', () => {
    expect(v.is(ProtocolEntrySchema, semantic)).toBe(true)
    const { seat: _seat, ...withoutSeat } = semantic
    expect(v.is(ProtocolEntrySchema, withoutSeat)).toBe(false)
  })

  test('validates normalized storage metadata and encoded body separately', () => {
    expect(
      v.is(StoredProtocolEntrySchema, {
        acceptedSeq: 1,
        entryIndex: 0,
        causedByCommandId: commandId,
        acceptedAt: 1,
        frameIndex: 1,
        source: semantic.source,
        entryType: semantic.entryType,
        seat: semantic.seat,
        bodyJson: '{"breaker":true}',
      }),
    ).toBe(true)
  })

  test('live update batches one or more entries under one accepted sequence', () => {
    expect(
      v.is(AcceptedCommandStreamUpdateSchema, {
        type: 'command-accepted',
        acceptedSeq: 1,
        entries: [semantic],
        terminal: false,
      }),
    ).toBe(true)
    expect(
      v.is(AcceptedCommandStreamUpdateSchema, {
        type: 'command-accepted',
        acceptedSeq: 1,
        entries: [],
        terminal: false,
      }),
    ).toBe(false)
  })
})
