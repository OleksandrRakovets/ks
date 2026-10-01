import {
  BySeatNumber,
  CommandId,
  FrameWinReason,
  GameConfiguration,
  NonNegativeInteger,
  PositiveInteger,
  Seat,
  SizedString,
  UnixEpochMilliseconds,
} from '@ks/core'
import { GameKey } from '@ks/gameplay/definitions'
import { GameProtocolEntry } from '@ks/gameplay/server'
import * as v from 'valibot'

export const CommandCorrectionReference = v.pipe(
  v.strictObject({
    /** 1-based sequence of the Accepted Command being corrected. */
    targetSeq: PositiveInteger,
    targetCommandId: CommandId,
    /** Original entry's 0-based position within the target command, unchanged by latest-first compensation. */
    targetEntryIndex: NonNegativeInteger,
  }),
  v.readonly(),
)

export type CommandCorrectionReference = v.InferOutput<typeof CommandCorrectionReference>

const ProtocolEntryContentFields = {
  gameKey: GameKey,
  frameIndex: PositiveInteger,
  source: v.picklist(['player', 'system']),
  entryType: SizedString(1, 64),
  seat: Seat,
  scoreAfter: v.optional(BySeatNumber),
} as const

const MatchLifecycleProtocolEntry = v.variant('entryType', [
  v.pipe(
    v.object({
      ...ProtocolEntryContentFields,
      entryType: v.literal('frame-prepared'),
      body: v.pipe(
        v.object({
          targetPointsBySeat: BySeatNumber,
          gameConfiguration: v.optional(GameConfiguration),
        }),
        v.readonly(),
      ),
    }),
    v.readonly(),
  ),
  v.pipe(
    v.object({
      ...ProtocolEntryContentFields,
      entryType: v.literal('frame-conceded'),
      body: v.object({}),
    }),
    v.readonly(),
  ),
  v.pipe(
    v.object({
      ...ProtocolEntryContentFields,
      entryType: v.literal('frame-awarded'),
      body: v.pipe(
        v.object({
          winReason: FrameWinReason,
        }),
        v.readonly(),
      ),
    }),
    v.readonly(),
  ),
  v.pipe(
    v.object({
      ...ProtocolEntryContentFields,
      entryType: v.literal('match-ended'),
      body: v.object({}),
    }),
    v.readonly(),
  ),
  v.pipe(
    v.object({
      ...ProtocolEntryContentFields,
      entryType: v.literal('command-corrected'),
      body: CommandCorrectionReference,
    }),
    v.readonly(),
  ),
])

const GameProtocolEntryContent = v.pipe(
  v.intersect([v.object({ frameIndex: PositiveInteger }), GameProtocolEntry]),
  v.readonly(),
)

export const ProtocolEntryContent = v.union([MatchLifecycleProtocolEntry, GameProtocolEntryContent])

export type ProtocolEntryContent = v.InferOutput<typeof ProtocolEntryContent>

const ProtocolEntryMetadata = v.object({
  /** 1-based Accepted Command sequence within the Match; zero is reserved for the initial checkpoint/cursor. */
  acceptedSeq: PositiveInteger,
  /**
   * 0-based position within this Accepted Command's Protocol entries, not the whole Protocol.
   * Resets for each command; together with acceptedSeq, uniquely identifies and orders an entry within the Match.
   */
  entryIndex: NonNegativeInteger,
  causedByCommandId: CommandId,
  acceptedAt: UnixEpochMilliseconds,
})

export const ProtocolEntry = v.pipe(v.intersect([ProtocolEntryMetadata, ProtocolEntryContent]), v.readonly())

export type ProtocolEntry = v.InferOutput<typeof ProtocolEntry>

export const ProtocolEntries = v.pipe(v.array(ProtocolEntry), v.readonly())

export type ProtocolEntries = v.InferOutput<typeof ProtocolEntries>

export function correctionReferenceOf(entry: ProtocolEntry): CommandCorrectionReference | undefined {
  if (entry.entryType !== 'command-corrected') return undefined

  return entry.body
}
