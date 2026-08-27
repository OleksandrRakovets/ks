import { SeatSchema } from '@ks/core'
import * as v from 'valibot'

export const FrameCommenceCommandSchema = v.strictObject({
  type: v.literal('frame.commence'),
  seat: SeatSchema,
})

export const FoulCommitCommandSchema = v.strictObject({
  type: v.literal('foul.commit'),
  seat: SeatSchema,
})

export const FrameAwardCommandSchema = v.strictObject({
  type: v.literal('frame.award'),
  seat: SeatSchema,
})
