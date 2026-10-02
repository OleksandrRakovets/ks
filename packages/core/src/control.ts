import { Schema } from 'effect'

import { Seat } from './match'
import { NonEmptyString, UnknownObject } from './valicombos'

const ControlProminence = Schema.Literals(['primary', 'secondary', 'tertiary'])

const ControlEffect = Schema.Literals([
  'opponent-plus-one',
  'offender-minus-one',
  'plus-one-point',
  'no-points-awarded',
])

/**
 * A renderable interaction permitted by the current match projection, not submitted intent.
 *
 * `seat` identifies and groups the focal seat without duplication in `fixedInput`. A renderer combines the type, seat,
 * fixed input, and any browser-collected input to produce a complete MatchCommand; prominence and effect stop at that
 * presentation boundary.
 */
export const Control = Schema.Struct({
  source: Schema.Literals(['match', 'game']),
  type: NonEmptyString,
  seat: Schema.optional(Seat),
  fixedInput: UnknownObject,
  effect: Schema.optional(ControlEffect),
  prominence: ControlProminence,
})

type Control = typeof Control.Type

const SeatControlBucket = Schema.Struct({
  A: Schema.Array(Control),
  B: Schema.Array(Control),
})

/** Controls available at one coherent match projection, organized solely for rendering. */
export const ControlSections = Schema.Struct({
  neutral: Schema.Array(Control),
  primary: SeatControlBucket,
  secondary: SeatControlBucket,
  tertiary: SeatControlBucket,
})

type MutableControlSections = {
  neutral: Control[]
  primary: { A: Control[]; B: Control[] }
  secondary: { A: Control[]; B: Control[] }
  tertiary: { A: Control[]; B: Control[] }
}

function emptyControlSections(): MutableControlSections {
  return {
    neutral: [],
    primary: { A: [], B: [] },
    secondary: { A: [], B: [] },
    tertiary: { A: [], B: [] },
  }
}

/** Groups controls for layout while preserving their input order within each bucket. Seatless controls are neutral. */
export function groupControlsIntoSections(controls: readonly Control[]): typeof ControlSections.Type {
  const sections = emptyControlSections()

  for (const control of controls) {
    if (control.seat) sections[control.prominence][control.seat].push(control)
    else sections.neutral.push(control)
  }

  return sections
}
