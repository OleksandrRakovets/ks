import * as v from 'valibot'

import { MatchCommand } from './command'
import { CommandId } from './ids'
import { BySeatNumber, GameKey, Seat } from './match'
import { UnixEpochMilliseconds } from './time'
import { NonNegativeInteger, PositiveInteger, SizedString, UnknownObject } from './valicombos'

export const ProtocolEntrySource = v.picklist(['player', 'system'])
export type ProtocolEntrySource = v.InferOutput<typeof ProtocolEntrySource>

/**
 * Game-owned Protocol content for the gameplay session's current frame.
 * Each game extends this structure with its exact body schema and parses entries when projecting accepted transitions.
 */
export const GameProtocolEntry = v.object({
  gameKey: GameKey,
  source: ProtocolEntrySource,
  entryType: SizedString(1, 64),
  seat: Seat,
  scoreAfter: v.optional(BySeatNumber),
  body: UnknownObject,
})
export type GameProtocolEntry = v.InferOutput<typeof GameProtocolEntry>

/** Complete Protocol meaning before MatchRoom attaches acceptance metadata. */
export const ProtocolEntryContent = v.object({
  frameIndex: PositiveInteger,
  ...GameProtocolEntry.entries,
})
export type ProtocolEntryContent = v.InferOutput<typeof ProtocolEntryContent>

export const NonEmptyProtocolEntryContents = v.pipe(v.array(ProtocolEntryContent), v.minLength(1))
export type NonEmptyProtocolEntryContents = v.InferOutput<typeof NonEmptyProtocolEntryContents>

/** Authoritative Protocol Entry with acceptance, causation, and ordering metadata. */
export const ProtocolEntry = v.object({
  acceptedSeq: PositiveInteger,
  entryIndex: NonNegativeInteger,
  causedByCommandId: CommandId,
  acceptedAt: UnixEpochMilliseconds,
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
