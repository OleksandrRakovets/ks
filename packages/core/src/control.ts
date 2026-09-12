import * as v from 'valibot'

import { Seat } from './match'
import { NonEmptyString, UnknownObject } from './valicombos'

const ControlProminence = v.picklist(['primary', 'secondary', 'tertiary'])

const ControlEffect = v.picklist([
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
export const Control = v.pipe(
  v.object({
    source: v.picklist(['match', 'game']),
    type: NonEmptyString,
    seat: v.optional(Seat),
    fixedInput: UnknownObject,
    effect: v.optional(ControlEffect),
    prominence: ControlProminence,
  }),
  v.readonly(),
)

export type Control = v.InferOutput<typeof Control>

const SeatControlBucket = v.pipe(
  v.object({
    A: v.pipe(v.array(Control), v.readonly()),
    B: v.pipe(v.array(Control), v.readonly()),
  }),
  v.readonly(),
)

/** Controls available at one coherent match projection, organized solely for rendering. */
export const ControlSections = v.pipe(
  v.object({
    neutral: v.pipe(v.array(Control), v.readonly()),
    primary: SeatControlBucket,
    secondary: SeatControlBucket,
    tertiary: SeatControlBucket,
  }),
  v.readonly(),
)

export type ControlSections = v.InferOutput<typeof ControlSections>

type MutableControlSections = {
  neutral: Control[]
  primary: { A: Control[]; B: Control[] }
  secondary: { A: Control[]; B: Control[] }
  tertiary: { A: Control[]; B: Control[] }
}

export function emptyControlSections(): MutableControlSections {
  return {
    neutral: [],
    primary: { A: [], B: [] },
    secondary: { A: [], B: [] },
    tertiary: { A: [], B: [] },
  }
}

/** Groups controls for layout while preserving their input order within each bucket. Seatless controls are neutral. */
export function groupControlsIntoSections(controls: readonly Control[]): ControlSections {
  const sections = emptyControlSections()

  for (const control of controls) {
    if (control.seat) sections[control.prominence][control.seat].push(control)
    else sections.neutral.push(control)
  }

  return sections
}
