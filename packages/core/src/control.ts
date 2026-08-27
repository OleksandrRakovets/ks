import * as v from 'valibot'

import { SeatSchema } from './match'
import { NonEmptyStringSchema, UnknownObjectSchema } from './valicombos'

const ControlProminence = v.picklist(['primary', 'secondary', 'tertiary'])
const ControlEffect = v.picklist(['opponent-plus-one', 'offender-minus-one', 'plus-one-point', 'no-points-awarded'])

/**
 * A renderable interaction permitted by the current match projection, not submitted intent.
 *
 * `seat` identifies and groups the focal seat without duplication in `fixedInput`. A renderer combines the type, seat,
 * fixed input, and any browser-collected input to produce a complete MatchCommand; prominence and effect stop at that
 * presentation boundary.
 */
export const Control = v.object({
  source: v.picklist(['match', 'game']),
  type: NonEmptyStringSchema,
  seat: v.optional(SeatSchema),
  fixedInput: UnknownObjectSchema,
  effect: v.optional(ControlEffect),
  prominence: ControlProminence,
})
export type Control = v.InferOutput<typeof Control>

const SeatControlBucket = v.object({
  A: v.array(Control),
  B: v.array(Control),
})

/** Controls available at one coherent match projection, organized solely for rendering. */
export const ControlSections = v.object({
  neutral: v.array(Control),
  primary: SeatControlBucket,
  secondary: SeatControlBucket,
  tertiary: SeatControlBucket,
})
export type ControlSections = v.InferOutput<typeof ControlSections>

export function emptyControlSections(): ControlSections {
  return {
    neutral: [],
    primary: { A: [], B: [] },
    secondary: { A: [], B: [] },
    tertiary: { A: [], B: [] },
  }
}
