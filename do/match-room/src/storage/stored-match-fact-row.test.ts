import { describe, expect, test } from 'bun:test'

import { CommandIdSchema, MatchIdSchema, newFactId, StoredMatchFactSchema, UnixEpochMillisecondsSchema } from '@ks/core'
import * as v from 'valibot'

import { decodeStoredMatchFactRow, encodeStoredMatchFactRow, type StoredMatchFactRow } from './stored-match-fact-row'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const acceptedAt = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000)

const fact = v.parse(StoredMatchFactSchema, {
  seq: 1,
  factId: newFactId(),
  matchId,
  acceptedAt: acceptedAt,
  causedByCommandId: null,
  type: 'match.created',
  payload: {
    matchId,
    gameKey: 'strila-v2',
    targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 1 },
    firstBreakerSeat: 'A',
  },
})

describe('stored match fact row codec', () => {
  test('round-trips a representative StoredMatchFact through encode and decode', () => {
    const row = encodeStoredMatchFactRow(fact)
    expect(decodeStoredMatchFactRow(row)).toEqual(fact)
  })

  test('round-trips command causation for submitted-command facts', () => {
    const commandId = v.parse(CommandIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAD')
    const commandFact = v.parse(StoredMatchFactSchema, {
      seq: 2,
      factId: newFactId(),
      matchId,
      acceptedAt: acceptedAt,
      causedByCommandId: commandId,
      type: 'frame.started',
      payload: {
        frameIndex: 1,
        gameKey: 'strila-v2',
        targetPointsBySeat: { A: 9, B: 9 },
        breakerSeat: 'A',
      },
    })
    const row = encodeStoredMatchFactRow(commandFact)
    expect(decodeStoredMatchFactRow(row)).toEqual(commandFact)
  })

  test.each([
    ['invalid JSON', (row: StoredMatchFactRow) => ({ ...row, payloadJson: '{' })],
    [
      'invalid discriminator and payload pair',
      (row: StoredMatchFactRow) => ({ ...row, type: 'match.ended', payloadJson: JSON.stringify({ frameIndex: 1 }) }),
    ],
    ['invalid scalar', (row: StoredMatchFactRow) => ({ ...row, seq: 0 })],
  ])('rejects %s', (_label, corrupt) => {
    expect(() => decodeStoredMatchFactRow(corrupt(encodeStoredMatchFactRow(fact)))).toThrow()
  })
})
