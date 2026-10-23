import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { formatPlayerRef } from './ids'

describe('player refs', () => {
  test('formats a player ref as the kind prefix joined to the id', () => {
    expect<string>(formatPlayerRef('gp', '01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('gp_01ARZ3NDEKTSV4RRFFQ69G5FAV')
  })

  test('rejects a malformed player ref', () => {
    expect(() => formatPlayerRef('gp', 'not-a-ulid')).toThrow(v.ValiError)
  })
})
