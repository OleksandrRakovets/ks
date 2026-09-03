import * as v from 'valibot'

import { MatchCommand } from './command'
import { CommandId } from './ids'
import { BySeatNumber, GameKey, Seat } from './match'
import { UnixEpochMilliseconds } from './time'
import { NonNegativeInteger, PositiveInteger, SizedString, UnknownObject } from './valicombos'

export const ProtocolEntrySource = v.picklist(['player', 'system'])
export type ProtocolEntrySource = v.InferOutput<typeof ProtocolEntrySource>

const GameProtocolEntryFields = v.object({
  gameKey: GameKey,
  source: ProtocolEntrySource,
  entryType: SizedString(1, 64),
  seat: Seat,
  scoreAfter: v.optional(BySeatNumber),
})

/**
 * Game-owned Protocol content for the gameplay session's current frame.
 * Each game extends this structure with its exact body schema and creates entries from accepted transitions.
 */
export const GameProtocolEntry = v.pipe(
  v.object({
    ...GameProtocolEntryFields.entries,
    body: UnknownObject,
  }),
  v.readonly(),
)
export type GameProtocolEntry = v.InferOutput<typeof GameProtocolEntry>

const ProtocolEntryContentFields = v.object({
  frameIndex: PositiveInteger,
  ...GameProtocolEntryFields.entries,
})

/** Complete Protocol meaning before MatchRoom attaches acceptance metadata. */
export const ProtocolEntryContent = v.pipe(
  v.object({
    ...ProtocolEntryContentFields.entries,
    body: UnknownObject,
  }),
  v.readonly(),
)
export type ProtocolEntryContent = v.InferOutput<typeof ProtocolEntryContent>

export const NonEmptyProtocolEntryContents = v.pipe(
  v.tupleWithRest([ProtocolEntryContent], ProtocolEntryContent),
  v.readonly(),
)
export type NonEmptyProtocolEntryContents = v.InferOutput<typeof NonEmptyProtocolEntryContents>

const ProtocolEntryFields = v.object({
  acceptedSeq: PositiveInteger,
  entryIndex: NonNegativeInteger,
  causedByCommandId: CommandId,
  acceptedAt: UnixEpochMilliseconds,
  ...ProtocolEntryContentFields.entries,
})

/** Authoritative Protocol Entry with acceptance, causation, and ordering metadata. */
export const ProtocolEntry = v.pipe(
  v.object({
    ...ProtocolEntryFields.entries,
    body: UnknownObject,
  }),
  v.readonly(),
)
export type ProtocolEntry = v.InferOutput<typeof ProtocolEntry>

export const ProtocolEntries = v.pipe(v.array(ProtocolEntry), v.readonly())
export type ProtocolEntries = v.InferOutput<typeof ProtocolEntries>

export const NonEmptyProtocolEntries = v.pipe(v.tupleWithRest([ProtocolEntry], ProtocolEntry), v.readonly())
export type NonEmptyProtocolEntries = v.InferOutput<typeof NonEmptyProtocolEntries>

/**
 * MatchRoom's persisted Protocol row decoder, where the Protocol body is stored as JSON text.
 * This is a storage-adapter schema; domain code should use ProtocolEntry instead.
 */
export const StoredProtocolEntryRow = v.pipe(
  v.object({
    ...ProtocolEntryFields.entries,
    bodyJson: v.pipe(v.string(), v.parseJson(), UnknownObject),
  }),
  v.transform(({ bodyJson, ...entry }) => ({ ...entry, body: bodyJson })),
  v.readonly(),
)

/** Durable replay input and its expected Protocol content. */
export const AcceptedCommandHistoryEntry = v.pipe(
  v.object({
    command: MatchCommand,
    protocolEntryContents: NonEmptyProtocolEntryContents,
  }),
  v.readonly(),
)
export type AcceptedCommandHistoryEntry = v.InferOutput<typeof AcceptedCommandHistoryEntry>
