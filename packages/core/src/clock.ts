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
