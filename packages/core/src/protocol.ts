import * as v from 'valibot'

import { ControlCommandSchema } from './control'
import { CommandIdSchema } from './ids'
import { BySeatNumberSchema, SeatSchema } from './match'
import { UnixEpochMillisecondsSchema } from './time'
import { NonNegativeIntegerSchema, PositiveIntegerSchema, SizedStringSchema, UnknownObjectSchema } from './valicombos'

export const ProtocolEntrySourceSchema = v.picklist(['player', 'system'])

/** Canonical semantic Protocol value produced by one accepted command. */
export const ProtocolEntrySchema = v.object({
  frameIndex: v.optional(PositiveIntegerSchema),
  source: ProtocolEntrySourceSchema,
  entryType: SizedStringSchema(1, 64),
  seat: SeatSchema,
  scoreAfter: v.optional(BySeatNumberSchema),
  body: UnknownObjectSchema,
})
export type ProtocolEntry = v.InferOutput<typeof ProtocolEntrySchema>
export const NonEmptyProtocolEntriesSchema = v.pipe(v.array(ProtocolEntrySchema), v.minLength(1))
export type NonEmptyProtocolEntries = v.InferOutput<typeof NonEmptyProtocolEntriesSchema>

/** Persistence representation; bodyJson must decode to the canonical body selected by entryType. */
export const StoredProtocolEntrySchema = v.object({
  acceptedSeq: PositiveIntegerSchema,
  entryIndex: NonNegativeIntegerSchema,
  causedByCommandId: CommandIdSchema,
  acceptedAt: UnixEpochMillisecondsSchema,
  frameIndex: v.optional(PositiveIntegerSchema),
  source: ProtocolEntrySourceSchema,
  entryType: SizedStringSchema(1, 64),
  seat: SeatSchema,
  scoreAfter: v.optional(BySeatNumberSchema),
  bodyJson: v.string(),
})
export type StoredProtocolEntry = v.InferOutput<typeof StoredProtocolEntrySchema>
export const NonEmptyStoredProtocolEntriesSchema = v.pipe(v.array(StoredProtocolEntrySchema), v.minLength(1))

/** Durable replay input and its expected canonical semantic output. */
export const AcceptedCommandHistoryEntrySchema = v.object({
  command: ControlCommandSchema,
  protocolEntries: NonEmptyProtocolEntriesSchema,
})
export type AcceptedCommandHistoryEntry = v.InferOutput<typeof AcceptedCommandHistoryEntrySchema>
