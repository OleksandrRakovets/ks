import {
  BySeatNumber,
  CommandId,
  FrameWinReason,
  GameConfiguration,
  NonNegativeInteger,
  PositiveInteger,
  type ProtocolEntry,
  ProtocolEntryContent,
} from '@ks/core'
import { RegisteredGameKey } from '@ks/gameplay/definitions'
import { parseGameProtocolEntry, type RegisteredGameProtocolEntry } from '@ks/gameplay/server'
import * as v from 'valibot'

export const CommandCorrectionReference = v.pipe(
  v.strictObject({
    targetSeq: PositiveInteger,
    targetCommandId: CommandId,
    targetEntryIndex: NonNegativeInteger,
  }),
  v.readonly(),
)

export type CommandCorrectionReference = v.InferOutput<typeof CommandCorrectionReference>

export const MatchLifecycleProtocolEntry = v.variant('entryType', [
  v.pipe(
    v.object({
      ...ProtocolEntryContent.entries,
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
    v.object({ ...ProtocolEntryContent.entries, entryType: v.literal('frame-conceded'), body: v.object({}) }),
    v.readonly(),
  ),
  v.pipe(
    v.object({
      ...ProtocolEntryContent.entries,
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
    v.object({ ...ProtocolEntryContent.entries, entryType: v.literal('match-ended'), body: v.object({}) }),
    v.readonly(),
  ),
  v.pipe(
    v.object({
      ...ProtocolEntryContent.entries,
      entryType: v.literal('command-corrected'),
      body: CommandCorrectionReference,
    }),
    v.readonly(),
  ),
])

export type MatchLifecycleProtocolEntry = v.InferOutput<typeof MatchLifecycleProtocolEntry>

export type RegisteredProtocolEntryContent =
  | MatchLifecycleProtocolEntry
  | (ProtocolEntryContent & RegisteredGameProtocolEntry)

export type RegisteredProtocolEntry = Omit<ProtocolEntry, keyof ProtocolEntryContent> &
  RegisteredProtocolEntryContent

export function correctionReferenceOf(entry: ProtocolEntry): CommandCorrectionReference | undefined {
  if (entry.entryType !== 'command-corrected') return undefined

  return v.parse(CommandCorrectionReference, entry.body)
}

/** Validates Protocol meaning against the selected game or competition lifecycle schema. */
export function parseProtocolEntryContent(input: ProtocolEntryContent): ProtocolEntryContent {
  return registeredProtocolEntryContent(input)
}

export function parseProtocolEntry(input: ProtocolEntry): RegisteredProtocolEntry {
  return { ...input, ...registeredProtocolEntryContent(input) }
}

function registeredProtocolEntryContent(input: ProtocolEntryContent): RegisteredProtocolEntryContent {
  const gameKey = v.parse(RegisteredGameKey, input.gameKey)
  const lifecycle = v.safeParse(MatchLifecycleProtocolEntry, input)

  if (lifecycle.success) return lifecycle.output
  const game = parseGameProtocolEntry(gameKey, input)

  return { ...input, ...game }
}
