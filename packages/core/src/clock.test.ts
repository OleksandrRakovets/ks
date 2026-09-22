import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { ClockFormatter, FixedClock, nowUnixEpochMilliseconds, UnixEpochMilliseconds } from './clock'

describe('Unix epoch milliseconds', () => {
  test('brands non-negative integer timestamps', () => {
    expect(Number(v.parse(UnixEpochMilliseconds, 1_700_000_000_000))).toBe(1_700_000_000_000)
    expect(v.safeParse(UnixEpochMilliseconds, -1).success).toBe(false)
    expect(v.safeParse(UnixEpochMilliseconds, 1.5).success).toBe(false)
  })

  test('reads the current JavaScript epoch-millisecond clock', () => {
    expect(nowUnixEpochMilliseconds()).toBeGreaterThan(1_700_000_000_000)
  })

  test('formats one instant in the requested clock zone', () => {
    const fixedDate = new Date('2026-09-22T21:30:00.000Z')
    const clock = new FixedClock(fixedDate, 'Europe/Kyiv')
    const instant = v.parse(UnixEpochMilliseconds, Date.parse('2026-09-22T21:15:00.000Z'))

    expect(Number(clock.now())).toBe(fixedDate.getTime())
    expect(ClockFormatter.format(instant, 'uk', clock.timeZone)).toEqual({
      isoString: '2026-09-22T21:15:00.000Z',
      time: '00:15',
      date: { year: '2026', month: '09', day: '23' },
    })
  })
})
