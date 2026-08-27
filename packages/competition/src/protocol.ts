import { BySeatNumber, ProtocolEntryContent, UnknownObject } from '@ks/core'
import { RegisteredGameKeySchema } from '@ks/gameplay/definitions'
import { parseGameProtocolEntry } from '@ks/gameplay/server'
import * as v from 'valibot'

export const MatchLifecycleProtocolEntry = v.variant('entryType', [
  v.object({
    ...ProtocolEntryContent.entries,
    entryType: v.literal('frame-prepared'),
    body: v.object({
      targetPointsBySeat: BySeatNumber,
      gameConfiguration: v.optional(UnknownObject),
    }),
  }),
  v.object({ ...ProtocolEntryContent.entries, entryType: v.literal('frame-conceded'), body: v.object({}) }),
  v.object({
    ...ProtocolEntryContent.entries,
    entryType: v.literal('frame-awarded'),
    body: v.object({
      winReason: v.picklist(['target-reached', 'conceded']),
    }),
  }),
  v.object({ ...ProtocolEntryContent.entries, entryType: v.literal('match-ended'), body: v.object({}) }),
])
export type MatchLifecycleProtocolEntry = v.InferOutput<typeof MatchLifecycleProtocolEntry>

/** Validates Protocol meaning against the selected game or competition lifecycle schema. */
export function parseProtocolEntryContent(input: ProtocolEntryContent): ProtocolEntryContent {
  const gameKey = v.parse(RegisteredGameKeySchema, input.gameKey)
  const lifecycle = v.safeParse(MatchLifecycleProtocolEntry, input)
  if (lifecycle.success) return lifecycle.output
  parseGameProtocolEntry(gameKey, input)
  return input
}
