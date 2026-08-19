import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import {
  ClientIdSchema,
  FactIdSchema,
  formatPlayerRef,
  formatPrefixedId,
  GuestPlayerIdSchema,
  MatchIdSchema,
  newClientId,
  newFactId,
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
    expect(v.is(FactIdSchema, newFactId())).toBe(true)
    expect(v.is(ClientIdSchema, newClientId())).toBe(true)
  })

  test('preserves prefixed ID formatting and optional-prefix stripping', () => {
    const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

    expect(formatPrefixedId('m', id)).toBe(`m_${id}`)
    expect(formatPlayerRef('gp', id)).toBe(v.parse(PlayerRefSchema, `gp_${id}`))
    expect(stripOptionalPrefix(`m_${id}`)).toBe(id)
    expect(stripOptionalPrefix(`unknown_${id}`)).toBe(id)
    expect(stripOptionalPrefix('not_a_ulid')).toBe('not_a_ulid')
  })
})
