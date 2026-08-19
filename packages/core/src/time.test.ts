import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { UnixEpochMillisecondsSchema, nowUnixEpochMilliseconds } from './time'

describe('Unix epoch milliseconds', () => {
  test('brands non-negative integer timestamps', () => {
    expect(Number(v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000))).toBe(1_700_000_000_000)
    expect(v.safeParse(UnixEpochMillisecondsSchema, -1).success).toBe(false)
    expect(v.safeParse(UnixEpochMillisecondsSchema, 1.5).success).toBe(false)
  })

  test('reads the current JavaScript epoch-millisecond clock', () => {
    expect(nowUnixEpochMilliseconds()).toBeGreaterThan(1_700_000_000_000)
  })
})
