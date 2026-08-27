import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { CommandId } from './ids'
import { GameProtocolEntry, ProtocolEntry } from './protocol'

const commandId = v.parse(CommandId, '01ARZ3NDEKTSV4RRFFQ69G5FAB')
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
})
