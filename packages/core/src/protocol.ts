import * as v from 'valibot'

import { MatchCommand } from './command'
import { CommandIdSchema } from './ids'
import { BySeatNumberSchema, GameKeySchema, SeatSchema } from './match'
import { UnixEpochMillisecondsSchema } from './time'
import { NonNegativeIntegerSchema, PositiveIntegerSchema, SizedStringSchema, UnknownObjectSchema } from './valicombos'

export const ProtocolEntrySource = v.picklist(['player', 'system'])
export type ProtocolEntrySource = v.InferOutput<typeof ProtocolEntrySource>

/**
 * Game-owned Protocol content for the gameplay session's current frame.
 * Each game extends this structure with its exact body schema and parses entries when projecting accepted transitions.
 */
export const GameProtocolEntry = v.object({
  gameKey: GameKeySchema,
  source: ProtocolEntrySource,
  entryType: SizedStringSchema(1, 64),
  seat: SeatSchema,
  scoreAfter: v.optional(BySeatNumberSchema),
  body: UnknownObjectSchema,
})
export type GameProtocolEntry = v.InferOutput<typeof GameProtocolEntry>

/** Complete Protocol meaning before MatchRoom attaches acceptance metadata. */
export const ProtocolEntryContent = v.object({
  frameIndex: PositiveIntegerSchema,
  ...GameProtocolEntry.entries,
})
export type ProtocolEntryContent = v.InferOutput<typeof ProtocolEntryContent>

export const NonEmptyProtocolEntryContents = v.pipe(v.array(ProtocolEntryContent), v.minLength(1))
export type NonEmptyProtocolEntryContents = v.InferOutput<typeof NonEmptyProtocolEntryContents>

/** Authoritative Protocol Entry with acceptance, causation, and ordering metadata. */
export const ProtocolEntry = v.object({
  acceptedSeq: PositiveIntegerSchema,
  entryIndex: NonNegativeIntegerSchema,
  causedByCommandId: CommandIdSchema,
  acceptedAt: UnixEpochMillisecondsSchema,
  ...ProtocolEntryContent.entries,
})
export type ProtocolEntry = v.InferOutput<typeof ProtocolEntry>

export const ProtocolEntries = v.array(ProtocolEntry)
export type ProtocolEntries = v.InferOutput<typeof ProtocolEntries>

export const NonEmptyProtocolEntries = v.pipe(ProtocolEntries, v.minLength(1))
export type NonEmptyProtocolEntries = v.InferOutput<typeof NonEmptyProtocolEntries>

/** Durable replay input and its expected Protocol content. */
export const AcceptedCommandHistoryEntry = v.object({
  command: MatchCommand,
  protocolEntryContents: NonEmptyProtocolEntryContents,
})
export type AcceptedCommandHistoryEntry = v.InferOutput<typeof AcceptedCommandHistoryEntry>
