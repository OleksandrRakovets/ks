import { type ControlCommandPayload, SeatSchema, UnknownObjectSchema } from '@ks/core'
import * as v from 'valibot'

export const FrameCommenceCommandSchema = v.strictObject({
  type: v.literal('frame.commence'),
  seat: SeatSchema,
})
export type FrameCommenceCommand = v.InferOutput<typeof FrameCommenceCommandSchema>

export const FoulCommitCommandSchema = v.strictObject({
  type: v.literal('foul.commit'),
  seat: SeatSchema,
})
export type FoulCommitCommand = v.InferOutput<typeof FoulCommitCommandSchema>

export const FrameAwardCommandSchema = v.strictObject({
  type: v.literal('frame.award'),
  seat: SeatSchema,
})
export type FrameAwardCommand = v.InferOutput<typeof FrameAwardCommandSchema>

export const GameCommandTransportPayloadSchema = v.pipe(
  UnknownObjectSchema,
  v.check((payload) => !('type' in payload), 'Payload must not supply type'),
)

export function canonicalGameCommandPayload<T extends { readonly type: string }>(command: T): ControlCommandPayload {
  const { type: _type, ...payload } = command
  return payload
}
