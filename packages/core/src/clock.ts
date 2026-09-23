import * as v from 'valibot'

import type { Brand } from './brand'
import { NonNegativeInteger } from './valicombos'

export type UnixEpochMilliseconds = Brand<number, 'UnixEpochMilliseconds'>

function toUnixEpochMilliseconds(value: number): UnixEpochMilliseconds {
  // SAFETY: The brand records the unit/epoch invariant after the enclosing schema validates the numeric representation.
  return value as UnixEpochMilliseconds
}

export const UnixEpochMilliseconds = v.pipe(NonNegativeInteger, v.transform(toUnixEpochMilliseconds))

export function nowUnixEpochMilliseconds(): UnixEpochMilliseconds {
  return v.parse(UnixEpochMilliseconds, Date.now())
}

/** Supplies wall-clock time and the IANA zone used for local calendar representation. */
export interface Clock {
  now(): UnixEpochMilliseconds
  /** UTC bounds of a calendar day in this Clock's zone, including daylight-saving transitions. */
  dayRange(day: string): { start: UnixEpochMilliseconds; end: UnixEpochMilliseconds }
  readonly timeZone: string
}

export class SystemClock implements Clock {
  readonly timeZone: string

  constructor(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    this.timeZone = timeZone
  }

  now(): UnixEpochMilliseconds {
    return nowUnixEpochMilliseconds()
  }

  dayRange(day: string) {
    return dayRange(day, this.timeZone)
  }
}

export class FixedClock implements Clock {
  readonly fixedDate: Date
  readonly timeZone: string

  constructor(fixedDate: Date, timeZone: string) {
    this.fixedDate = fixedDate
    this.timeZone = timeZone
  }

  now(): UnixEpochMilliseconds {
    return v.parse(UnixEpochMilliseconds, this.fixedDate.getTime())
  }

  dayRange(day: string) {
    return dayRange(day, this.timeZone)
  }
}

export type FormattedInstant = Readonly<{
  isoString: string
  time: string
  date: Readonly<{ year: string; month: string; day: string }>
}>

/** Formats instants in a requested zone while preserving their canonical UTC ISO value. */
export class ClockFormatter {
  static format(value: UnixEpochMilliseconds, locale: string, timeZone: string): FormattedInstant {
    const date = new Date(value)

    const dateParts = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    }).formatToParts(date)

    const year = dateParts.find((part) => part.type === 'year')?.value
    const month = dateParts.find((part) => part.type === 'month')?.value
    const day = dateParts.find((part) => part.type === 'day')?.value

    if (year === undefined || month === undefined || day === undefined)
      throw new Error('Date formatter did not return calendar parts')

    return {
      isoString: date.toISOString(),
      time: new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone,
      }).format(date),
      date: { year, month, day },
    }
  }
}

function dayRange(day: string, timeZone: string) {
  const startDay = Date.parse(`${day}T00:00:00Z`)

  const formatter = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  })

  function startOf(target: number): UnixEpochMilliseconds {
    const estimate = target
    let low = Math.max(0, estimate - 36 * 3_600_000)
    let high = estimate + 36 * 3_600_000

    while (low < high) {
      const middle = low + Math.floor((high - low) / 2)
      const parts = formatter.formatToParts(middle)
      const year = Number(parts.find((part) => part.type === 'year')?.value)
      const month = Number(parts.find((part) => part.type === 'month')?.value)
      const day = Number(parts.find((part) => part.type === 'day')?.value)
      const local = Date.UTC(year, month - 1, day)

      if (local < target) low = middle + 1
      else high = middle
    }

    return v.parse(UnixEpochMilliseconds, low)
  }

  return { start: startOf(startDay), end: startOf(startDay + 86_400_000) }
}
