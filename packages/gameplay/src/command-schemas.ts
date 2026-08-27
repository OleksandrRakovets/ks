import { Seat } from '@ks/core'
import * as v from 'valibot'

export const FrameCommenceCommandSchema = v.strictObject({
  type: v.literal('frame.commence'),
  seat: Seat,
})

export const FoulCommitCommandSchema = v.strictObject({
  type: v.literal('foul.commit'),
  seat: Seat,
})

export const FrameAwardCommandSchema = v.strictObject({
  type: v.literal('frame.award'),
  seat: Seat,
})
