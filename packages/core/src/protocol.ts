import * as v from 'valibot'

import { CommandId } from './ids'
import { BySeatNumber, GameKey, Seat } from './match'
import { UnixEpochMilliseconds } from './time'
import { NonNegativeInteger, PositiveInteger, SizedString, UnknownObject } from './valicombos'

export const ProtocolEntrySource = v.picklist(['player', 'system'])
export type ProtocolEntrySource = v.InferOutput<typeof ProtocolEntrySource>

/**
 * Game-owned Protocol content for the gameplay session's current frame.
 * Each game extends this structure with its exact body schema and creates entries from accepted transitions.
 */
export const GameProtocolEntry = v.pipe(
  v.object({
    gameKey: GameKey,
    source: ProtocolEntrySource,
    entryType: SizedString(1, 64),
    seat: Seat,
    scoreAfter: v.optional(BySeatNumber),
    body: UnknownObject,
  }),
  v.readonly(),
)
export type GameProtocolEntry = v.InferOutput<typeof GameProtocolEntry>

/** Complete Protocol meaning before MatchRoom attaches acceptance metadata. */
export const ProtocolEntryContent = v.pipe(
  v.object({
    frameIndex: PositiveInteger,
    ...GameProtocolEntry.entries,
  }),
  v.readonly(),
)
export type ProtocolEntryContent = v.InferOutput<typeof ProtocolEntryContent>

export const NonEmptyProtocolEntryContents = v.pipe(
  v.tupleWithRest([ProtocolEntryContent], ProtocolEntryContent),
  v.readonly(),
)
export type NonEmptyProtocolEntryContents = v.InferOutput<typeof NonEmptyProtocolEntryContents>

/** Authoritative Protocol Entry with acceptance, causation, and ordering metadata. */
export const ProtocolEntry = v.pipe(
  v.object({
    acceptedSeq: PositiveInteger,
    entryIndex: NonNegativeInteger,
    causedByCommandId: CommandId,
    acceptedAt: UnixEpochMilliseconds,
    ...ProtocolEntryContent.entries,
  }),
  v.readonly(),
)
export type ProtocolEntry = v.InferOutput<typeof ProtocolEntry>

export const ProtocolEntries = v.pipe(v.array(ProtocolEntry), v.readonly())
export type ProtocolEntries = v.InferOutput<typeof ProtocolEntries>

export const NonEmptyProtocolEntries = v.pipe(v.tupleWithRest([ProtocolEntry], ProtocolEntry), v.readonly())
export type NonEmptyProtocolEntries = v.InferOutput<typeof NonEmptyProtocolEntries>
