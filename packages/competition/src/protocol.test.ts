import { describe, expect, test } from 'bun:test'

import { newCommandId, UnixEpochMilliseconds } from '@ks/core'
import { Schema } from 'effect'

import { CommandCorrectionReference, ProtocolEntry } from './protocol'

const metadata = {
  acceptedSeq: 1,
  entryIndex: 0,
  causedByCommandId: newCommandId(),
  acceptedAt: Schema.decodeUnknownSync(UnixEpochMilliseconds)(1_700_000_000_000),
  frameIndex: 1,
  source: 'player' as const,
  entryType: 'player-command' as const,
  seat: 'A' as const,
}

describe('ProtocolEntry', () => {
  test('parses acceptance metadata and concrete game content together', () => {
    const entry: typeof ProtocolEntry.Type = {
      ...metadata,
      gameKey: 'free-pyramid',
      body: { commandType: 'pot.record', pottedBallCount: 2 },
    }

    expect(Schema.decodeUnknownSync(ProtocolEntry)(entry)).toEqual(entry)
  })

  test('strips envelope extras but keeps correction bodies closed and their indexes bounded', () => {
    const body = { targetSeq: 2, targetCommandId: newCommandId(), targetEntryIndex: 0 }

    const entry = {
      ...metadata,
      gameKey: 'free-pyramid',
      entryType: 'command-corrected',
      body,
    } satisfies typeof ProtocolEntry.Type

    expect(Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, extra: true })).toEqual(entry)
    expect(Schema.decodeUnknownSync(CommandCorrectionReference)(body)).toEqual(body)
    expect(() =>
      Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, body: { ...body, extra: true } }),
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(CommandCorrectionReference)({ ...body, targetSeq: 0 })).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(CommandCorrectionReference)({ ...body, targetEntryIndex: -1 }),
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, acceptedSeq: 0 })).toThrow()
    expect(() => Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, entryIndex: -1 })).toThrow()
  })

  test.each(['frame-conceded', 'match-ended'])(
    'strips empty %s bodies and rejects primitives',
    (entryType) => {
      const entry = {
        ...metadata,
        gameKey: 'free-pyramid',
        entryType,
        body: {},
      } satisfies typeof ProtocolEntry.Type

      expect(Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, body: { extra: true } })).toEqual(entry)
      expect(Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, body: [] })).toEqual(entry)
      expect(() => Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, body: 'invalid' })).toThrow()
      expect(() => Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, body: null })).toThrow()
      expect(Schema.decodeUnknownSync(ProtocolEntry)({ ...entry, scoreAfter: undefined })).toHaveProperty(
        'scoreAfter',
        undefined,
      )
      expect(Schema.decodeUnknownSync(ProtocolEntry)(entry)).not.toHaveProperty('scoreAfter')
      expect(Schema.decodeUnknownSync(ProtocolEntry)(JSON.parse(JSON.stringify(entry)))).toEqual(entry)
    },
  )

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

    expect(Schema.is(ProtocolEntry)(wrongGameBody)).toBe(false)
    expect(Schema.is(ProtocolEntry)(withoutSeat)).toBe(false)
  })
})
