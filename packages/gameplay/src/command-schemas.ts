import { Seat } from '@ks/core'
import * as v from 'valibot'

export const FrameCommenceCommand = v.pipe(
  v.strictObject({
    type: v.literal('frame.commence'),
    seat: Seat,
  }),
  v.readonly(),
)

export const FoulCommitCommand = v.pipe(
  v.strictObject({
    type: v.literal('foul.commit'),
    seat: Seat,
  }),
  v.readonly(),
)

export const FrameAwardCommand = v.pipe(
  v.strictObject({
    type: v.literal('frame.award'),
    seat: Seat,
  }),
  v.readonly(),
)
