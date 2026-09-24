import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { FixedClock, SystemClock, UnixEpochMilliseconds } from './clock'

describe('Unix epoch milliseconds', () => {
  test('brands non-negative integer timestamps', () => {
    expect(Number(v.parse(UnixEpochMilliseconds, 1_700_000_000_000))).toBe(1_700_000_000_000)
    expect(v.safeParse(UnixEpochMilliseconds, -1).success).toBe(false)
    expect(v.safeParse(UnixEpochMilliseconds, 1.5).success).toBe(false)
  })

  test('reads the current JavaScript epoch-millisecond clock', () => {
    expect(new SystemClock().nowMs()).toBeGreaterThan(1_700_000_000_000)
  })

  test('presents a supplied instant and the fixed now in the clock zone', () => {
    const fixedDate = new Date('2026-09-22T21:30:00.000Z')
    const clock = new FixedClock(fixedDate, 'Europe/Kyiv')
    const instant = v.parse(UnixEpochMilliseconds, Date.parse('2026-09-22T21:15:00.000Z'))

    expect(Number(clock.nowMs())).toBe(fixedDate.getTime())
    expect(clock.instantPresentation(instant)).toEqual({
      isoString: '2026-09-22T21:15:00.000Z',
      time: '00:15',
      date: { year: '2026', month: '09', day: '23' },
    })
    expect(clock.nowPresentation()).toEqual({
      isoString: '2026-09-22T21:30:00.000Z',
      time: '00:30',
      date: { year: '2026', month: '09', day: '23' },
    })
    expect(new SystemClock('UTC').instantPresentation(instant)).toEqual({
      isoString: '2026-09-22T21:15:00.000Z',
      time: '21:15',
      date: { year: '2026', month: '09', day: '22' },
    })
  })

  test('bounds local days across both Kyiv clock changes and a date-line offset', () => {
    const kyiv = new FixedClock(new Date('2026-03-29T00:00:00Z'), 'Europe/Kyiv')
    const spring = kyiv.dayRange('2026-03-29')
    expect(new Date(spring.start).toISOString()).toBe('2026-03-28T22:00:00.000Z')
    expect(new Date(spring.end).toISOString()).toBe('2026-03-29T21:00:00.000Z')

    const autumn = kyiv.dayRange('2026-10-25')
    expect(new Date(autumn.start).toISOString()).toBe('2026-10-24T21:00:00.000Z')
    expect(new Date(autumn.end).toISOString()).toBe('2026-10-25T22:00:00.000Z')

    const auckland = new FixedClock(new Date('2026-09-23T00:00:00Z'), 'Pacific/Auckland').dayRange(
      '2026-09-23',
    )

    expect(new Date(auckland.start).toISOString()).toBe('2026-09-22T12:00:00.000Z')
    expect(new Date(auckland.end).toISOString()).toBe('2026-09-23T12:00:00.000Z')
  })
})
