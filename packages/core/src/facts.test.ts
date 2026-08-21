import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { StoredFactSchema } from './facts'
import { ClientIdSchema, FactIdSchema, MatchIdSchema } from './ids'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const otherMatchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAA')
const factId = v.parse(FactIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAB')
const clientId = v.parse(ClientIdSchema, 'server0000')

function storedMatchCreated(envelopeMatchId: string, payloadMatchId: string, gameKey = 'free-pyramid') {
  return {
    seq: 1,
    factId,
    matchId: envelopeMatchId,
    clientId,
    clientSeq: 0,
    at: 1_700_000_000_000,
    receivedAt: 1_700_000_000_001,
    type: 'match.created',
    payload: {
      matchId: payloadMatchId,
      gameKey,
      targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
      firstBreakerSeat: 'A',
    },
  }
}

describe('stored fact identity', () => {
  test('rejects mismatched match.created envelope and payload IDs', () => {
    expect(v.safeParse(StoredFactSchema, storedMatchCreated(matchId, otherMatchId)).success).toBe(false)
  })

  test('decodes a syntactically valid historical game key without requiring a registered runtime', () => {
    const fact = v.parse(StoredFactSchema, storedMatchCreated(matchId, matchId, 'historical-game'))
    expect(fact.type).toBe('match.created')
    if (fact.type !== 'match.created') throw new Error('Expected match.created fact')
    expect(fact.payload.gameKey).toBe('historical-game')
  })
})
