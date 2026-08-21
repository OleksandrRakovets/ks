import { describe, expect, test } from 'bun:test'

import { ClientIdSchema, MatchIdSchema, newFactId, StoredFactSchema, UnixEpochMillisecondsSchema } from '@ks/core'
import * as v from 'valibot'

import { decodeStoredFactRow, encodeStoredFactRow, type StoredFactRow } from './accepted-fact-row'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const clientId = v.parse(ClientIdSchema, 'server0000')
const at = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000)

const fact = v.parse(StoredFactSchema, {
  seq: 1,
  factId: newFactId(),
  matchId,
  clientId,
  clientSeq: 0,
  at,
  receivedAt: at,
  type: 'match.created',
  payload: {
    matchId,
    gameKey: 'strila-v2',
    targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 1 },
    firstBreakerSeat: 'A',
  },
})

describe('accepted fact row codec', () => {
  test('round-trips a representative StoredFact through encode and decode', () => {
    const row = encodeStoredFactRow(fact)
    expect(decodeStoredFactRow(row)).toEqual(fact)
  })

  test.each([
    ['invalid JSON', (row: StoredFactRow) => ({ ...row, payloadJson: '{' })],
    [
      'invalid discriminator and payload pair',
      (row: StoredFactRow) => ({ ...row, type: 'match.ended', payloadJson: JSON.stringify({ frameIndex: 1 }) }),
    ],
    ['invalid scalar', (row: StoredFactRow) => ({ ...row, seq: 0 })],
  ])('rejects %s', (_label, corrupt) => {
    expect(() => decodeStoredFactRow(corrupt(encodeStoredFactRow(fact)))).toThrow()
  })
})
