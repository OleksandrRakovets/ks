import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

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
    expect(v.is(GuestPlayerId, newGuestPlayerId())).toBe(true)
    expect(v.is(VerifiedPlayerId, newVerifiedPlayerId())).toBe(true)
    expect(v.is(MatchId, newMatchId())).toBe(true)
  })

  test('formats player refs', () => {
    const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

    expect(formatPlayerRef('gp', id)).toBe(v.parse(PlayerRef, `gp_${id}`))
  })
})
