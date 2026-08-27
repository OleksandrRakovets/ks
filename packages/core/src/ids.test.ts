import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import {
  formatPlayerRef,
  GuestPlayerIdSchema,
  MatchIdSchema,
  newGuestPlayerId,
  newMatchId,
  newVerifiedPlayerId,
  PlayerRefSchema,
  stripOptionalPrefix,
  VerifiedPlayerIdSchema,
} from './ids'

describe('ID generation', () => {
  test('npm ULIDs satisfy every public generated ID schema', () => {
    expect(v.is(GuestPlayerIdSchema, newGuestPlayerId())).toBe(true)
    expect(v.is(VerifiedPlayerIdSchema, newVerifiedPlayerId())).toBe(true)
    expect(v.is(MatchIdSchema, newMatchId())).toBe(true)
  })

  test('formats player refs and strips optional ULID prefixes', () => {
    const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

    expect(formatPlayerRef('gp', id)).toBe(v.parse(PlayerRefSchema, `gp_${id}`))
    expect(stripOptionalPrefix(`m_${id}`)).toBe(id)
    expect(stripOptionalPrefix(`unknown_${id}`)).toBe(id)
    expect(stripOptionalPrefix('not_a_ulid')).toBe('not_a_ulid')
  })
})
