import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { CommandIdSchema } from './ids'
import { GameProtocolEntry, ProtocolEntry } from './protocol'
import { AcceptedCommandStreamUpdate } from './wire'

const commandId = v.parse(CommandIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAB')
const semantic = {
  gameKey: 'strila-v2',
  frameIndex: 1,
  source: 'system' as const,
  entryType: 'frame-prepared',
  seat: 'A' as const,
  body: { breaker: true },
}
const authoritative = {
  ...semantic,
  acceptedSeq: 1,
  entryIndex: 0,
  causedByCommandId: commandId,
  acceptedAt: 1,
}

describe('Protocol contracts', () => {
  test('requires a focal seat on every semantic entry', () => {
    expect(v.is(GameProtocolEntry, semantic)).toBe(true)
    const { seat: _seat, ...withoutSeat } = semantic
    expect(v.is(GameProtocolEntry, withoutSeat)).toBe(false)
  })

  test('validates acceptance metadata with structured Protocol content', () => {
    expect(v.is(ProtocolEntry, authoritative)).toBe(true)
  })

  test('live update batches one or more entries under one accepted sequence', () => {
    expect(
      v.is(AcceptedCommandStreamUpdate, {
        type: 'command-accepted',
        acceptedSeq: 1,
        entries: [authoritative],
        terminal: false,
      }),
    ).toBe(true)
    expect(
      v.is(AcceptedCommandStreamUpdate, {
        type: 'command-accepted',
        acceptedSeq: 1,
        entries: [],
        terminal: false,
      }),
    ).toBe(false)
  })
})
