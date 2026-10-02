import {
  BySeatNumber,
  CommandId,
  FrameWinReason,
  GameConfiguration,
  NonNegativeInteger,
  PositiveInteger,
  Seat,
  SizedString,
  StrictStruct,
  UnixEpochMilliseconds,
} from '@ks/core'
import { GameKey } from '@ks/gameplay/definitions'
import { GameProtocolEntry } from '@ks/gameplay/server'
import { Schema, SchemaGetter, Tuple } from 'effect'

export const CommandCorrectionReference = StrictStruct({
  /** 1-based sequence of the Accepted Command being corrected. */
  targetSeq: PositiveInteger,
  targetCommandId: CommandId,
  /** Original entry's 0-based position within the target command, unchanged by latest-first compensation. */
  targetEntryIndex: NonNegativeInteger,
})

const ProtocolEntryContentFields = {
  gameKey: GameKey,
  frameIndex: PositiveInteger,
  source: Schema.Literals(['player', 'system']),
  entryType: SizedString(1, 64),
  seat: Seat,
  scoreAfter: Schema.optional(BySeatNumber),
} as const

// Empty lifecycle bodies still require an object and discard its fields on decode.
const EmptyProtocolBody = Schema.Union([
  Schema.Record(Schema.String, Schema.Unknown),
  Schema.Array(Schema.Unknown),
]).pipe(
  Schema.decodeTo(Schema.Struct({}), {
    decode: SchemaGetter.transform(() => ({})),
    encode: SchemaGetter.transform((body) => body),
  }),
)

const MatchLifecycleProtocolEntry = Schema.Union([
  Schema.Struct({
    ...ProtocolEntryContentFields,
    entryType: Schema.Literal('frame-prepared'),
    body: Schema.Struct({
      targetPointsBySeat: BySeatNumber,
      gameConfiguration: Schema.optional(GameConfiguration),
    }),
  }),
  Schema.Struct({
    ...ProtocolEntryContentFields,
    entryType: Schema.Literal('frame-conceded'),
    body: EmptyProtocolBody,
  }),
  Schema.Struct({
    ...ProtocolEntryContentFields,
    entryType: Schema.Literal('frame-awarded'),
    body: Schema.Struct({ winReason: FrameWinReason }),
  }),
  Schema.Struct({
    ...ProtocolEntryContentFields,
    entryType: Schema.Literal('match-ended'),
    body: EmptyProtocolBody,
  }),
  Schema.Struct({
    ...ProtocolEntryContentFields,
    entryType: Schema.Literal('command-corrected'),
    body: CommandCorrectionReference,
  }),
])

const GameProtocolEntryContent = GameProtocolEntry.mapMembers(
  Tuple.map(Schema.fieldsAssign({ frameIndex: PositiveInteger })),
)

export const ProtocolEntryContent = Schema.Union([
  ...MatchLifecycleProtocolEntry.members,
  ...GameProtocolEntryContent.members,
])

const ProtocolEntryMetadata = {
  /** 1-based Accepted Command sequence within the Match; zero is reserved for the initial checkpoint/cursor. */
  acceptedSeq: PositiveInteger,
  /**
   * 0-based position within this Accepted Command's Protocol entries, not the whole Protocol.
   * Resets for each command; together with acceptedSeq, uniquely identifies and orders an entry within the Match.
   */
  entryIndex: NonNegativeInteger,
  causedByCommandId: CommandId,
  acceptedAt: UnixEpochMilliseconds,
}

export const ProtocolEntry = ProtocolEntryContent.mapMembers(
  Tuple.map(Schema.fieldsAssign(ProtocolEntryMetadata)),
)

export const ProtocolEntries = Schema.Array(ProtocolEntry)

export function correctionReferenceOf(
  entry: typeof ProtocolEntry.Type,
): typeof CommandCorrectionReference.Type | undefined {
  if (entry.entryType !== 'command-corrected') return undefined

  return entry.body
}
