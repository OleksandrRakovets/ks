import { Seat } from '@ks/core'
import * as v from 'valibot'

export const FrameCommenceCommand = v.strictObject({
  type: v.literal('frame.commence'),
  seat: Seat,
})

export const FoulCommitCommand = v.strictObject({
  type: v.literal('foul.commit'),
  seat: Seat,
})

export const FrameAwardCommand = v.strictObject({
  type: v.literal('frame.award'),
  seat: Seat,
})
