import { MatchCreationDefinitionSchema, type MatchSnapshotFor, type SparringMatchRejection } from '@ks/competition'
import type {
  AcceptedFactRef,
  CommandId,
  ControlCommand,
  ControlCommandSections,
  HydratedMatchParticipants,
  MatchId,
  UnixEpochMilliseconds,
} from '@ks/core'
import type { ControlProjectionFor, RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type { ProtocolRow } from './protocol'

export type { HydratedMatchParticipant, HydratedMatchParticipants } from '@ks/core'

export type CommandReceiptOutcome =
  | { readonly _tag: 'accepted'; readonly accepted: readonly AcceptedFactRef[] }
  | { readonly _tag: 'rejected'; readonly reason: SparringMatchRejection }

export const DisplayNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.replace(/\s+/g, ' ')),
  v.minLength(1),
  // "I Lastname" becomes "I. Lastname" when hydrated, so creation reserves one character for the short form.
  v.maxLength(127),
)

export const CreateMatchInputSchema = v.pipe(
  v.intersect([
    MatchCreationDefinitionSchema,
    v.object({ playerNames: v.object({ A: DisplayNameSchema, B: DisplayNameSchema }) }),
  ]),
  v.check((value) => value.playerNames.A !== value.playerNames.B, 'Players must have different display names'),
)
export type CreateMatchInput = v.InferInput<typeof CreateMatchInputSchema>

export type CreateMatchResult = { ok: true; matchId: MatchId } | { ok: false; error: string; status: number }

export type MatchListEntry = {
  matchId: MatchId
  gameKey: RegisteredGameKey
  gameTitle: string
  status: 'active' | 'finished'
  createdAt: UnixEpochMilliseconds
  participants: HydratedMatchParticipants
}

export type ReadMatchFailure = { ok: false; error: string; status: number }

export type ReadMatchControlResult<K extends RegisteredGameKey> =
  | {
      ok: true
      state: 'frame-active'
      snapshot: MatchSnapshotFor<K>
      controlProjection: ControlProjectionFor<K>
      controlSections: ControlCommandSections
      participants: HydratedMatchParticipants
    }
  | {
      ok: true
      state: 'between-frames'
      snapshot: MatchSnapshotFor<K>
      controlSections: ControlCommandSections
      participants: HydratedMatchParticipants
    }
  | ReadMatchFailure

export type CommandMatchResult =
  | { ok: true; outcome: CommandReceiptOutcome; finalizing?: true }
  | { ok: false; error: string; status: number }

export type ReadMatchProtocolResult<K extends RegisteredGameKey> =
  | {
      ok: true
      snapshot: MatchSnapshotFor<K>
      controlProjection?: ControlProjectionFor<K>
      participants: HydratedMatchParticipants
      protocolRows: ProtocolRow[]
    }
  | ReadMatchFailure

export type Application = {
  createMatch(input: CreateMatchInput): Promise<CreateMatchResult>
  listMatches(locale: SupportedLocale): Promise<MatchListEntry[]>
  readMatchControl<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchControlResult<K>>
  commandMatch<K extends RegisteredGameKey>(
    matchId: MatchId,
    commandId: CommandId,
    command: ControlCommand,
    expectedGameKey: K,
  ): Promise<CommandMatchResult>
  readMatchProtocol<K extends RegisteredGameKey>(
    matchId: MatchId,
    timeZone: string,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>>
  streamMatchFacts(matchId: MatchId, since?: number): Promise<Response>
}
