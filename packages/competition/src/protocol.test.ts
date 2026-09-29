import { describe, expect, test } from 'bun:test'

import { newCommandId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { ProtocolEntry } from './protocol'

const metadata = {
  acceptedSeq: 1,
  entryIndex: 0,
  causedByCommandId: newCommandId(),
  acceptedAt: v.parse(UnixEpochMilliseconds, 1_700_000_000_000),
  frameIndex: 1,
  source: 'player' as const,
  entryType: 'player-command' as const,
  seat: 'A' as const,
}

describe('ProtocolEntry', () => {
  test('parses acceptance metadata and concrete game content together', () => {
    const entry: ProtocolEntry = {
      ...metadata,
      gameKey: 'free-pyramid',
      body: { commandType: 'pot.record', pottedBallCount: 2 },
    }

    expect(v.parse(ProtocolEntry, entry)).toEqual(entry)
  })

  test('rejects a body owned by a different game and an entry without a focal seat', () => {
    const wrongGameBody = {
      ...metadata,
      gameKey: 'strila-v2',
      body: { commandType: 'pot.record', pottedBallCount: 1 },
    }

    const { seat: _seat, ...withoutSeat } = {
      ...metadata,
      gameKey: 'free-pyramid',
      body: { commandType: 'pot.record', pottedBallCount: 1 },
    }

    expect(v.is(ProtocolEntry, wrongGameBody)).toBe(false)
    expect(v.is(ProtocolEntry, withoutSeat)).toBe(false)
  })
})
