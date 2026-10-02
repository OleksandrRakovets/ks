import { describe, expect, test } from 'bun:test'

import { Schema } from 'effect'

import {
  formatPlayerRef,
  GuestPlayerId,
  MatchId,
  newGuestPlayerId,
  newMatchId,
  newVerifiedPlayerId,
  PlayerRef,
  VerifiedPlayerId,
} from './ids'

describe('ID generation', () => {
  test('npm ULIDs satisfy every public generated ID schema', () => {
    expect(Schema.is(GuestPlayerId)(newGuestPlayerId())).toBe(true)
    expect(Schema.is(VerifiedPlayerId)(newVerifiedPlayerId())).toBe(true)
    expect(Schema.is(MatchId)(newMatchId())).toBe(true)
  })

  test('formats player refs', () => {
    const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

    expect(formatPlayerRef('gp', id)).toBe(Schema.decodeUnknownSync(PlayerRef)(`gp_${id}`))
  })
})
