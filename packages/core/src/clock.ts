import { Schema } from 'effect'

import { NonNegativeInteger } from './valicombos'

export const UnixEpochMilliseconds = NonNegativeInteger.pipe(Schema.brand('UnixEpochMilliseconds'))

/** Supplies wall-clock instants and their presentation in one IANA zone. */
export interface Clock {
  /** Returns an absolute instant in Unix epoch milliseconds; the zone does not affect it. */
  nowMs(): typeof UnixEpochMilliseconds.Type
  /** Returns UTC ISO, zero-padded date parts in this clock's zone, and 24-hour time; the zone is not carried in the result. */
  instantPresentation(instant: typeof UnixEpochMilliseconds.Type): InstantPresentation
  /** Presents this clock's current instant in its zone, without choosing a surface-specific label. */
  nowPresentation(): InstantPresentation
  /** UTC bounds of a calendar day in this Clock's zone, including daylight-saving transitions. */
  dayRange(day: string): { start: typeof UnixEpochMilliseconds.Type; end: typeof UnixEpochMilliseconds.Type }
}

/** Uses the system's current instant and one zone for calendar presentation. */
export class SystemClock implements Clock {
  readonly #timeZone: string

  constructor(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    this.#timeZone = timeZone
  }

  nowMs(): typeof UnixEpochMilliseconds.Type {
    return Schema.decodeUnknownSync(UnixEpochMilliseconds)(Date.now())
  }

  instantPresentation(instant: typeof UnixEpochMilliseconds.Type): InstantPresentation {
    const date = new Date(instant)

    const dateParts = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: this.#timeZone,
    }).formatToParts(date)

    const year = dateParts.find((part) => part.type === 'year')?.value
    const month = dateParts.find((part) => part.type === 'month')?.value
    const day = dateParts.find((part) => part.type === 'day')?.value

    if (year === undefined || month === undefined || day === undefined)
      throw new Error('Date formatter did not return calendar parts')

    return {
      isoString: date.toISOString(),
      time: new Intl.DateTimeFormat('en', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: this.#timeZone,
      }).format(date),
      date: { year, month, day },
    }
  }

  nowPresentation(): InstantPresentation {
    return this.instantPresentation(this.nowMs())
  }

  dayRange(day: string) {
    return dayRange(day, this.#timeZone)
  }
}

export class FixedClock extends SystemClock {
  readonly fixedDate: Date

  constructor(fixedDate: Date, timeZone: string) {
    super(timeZone)
    this.fixedDate = fixedDate
  }

  override nowMs(): typeof UnixEpochMilliseconds.Type {
    return Schema.decodeUnknownSync(UnixEpochMilliseconds)(this.fixedDate.getTime())
  }
}

export type InstantPresentation = Readonly<{
  isoString: string
  time: string
  date: Readonly<{ year: string; month: string; day: string }>
}>

function dayRange(day: string, timeZone: string) {
  const startDay = Date.parse(`${day}T00:00:00Z`)

  const formatter = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  })

  function startOf(target: number): typeof UnixEpochMilliseconds.Type {
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

    return Schema.decodeUnknownSync(UnixEpochMilliseconds)(low)
  }

  return { start: startOf(startDay), end: startOf(startDay + 86_400_000) }
}
