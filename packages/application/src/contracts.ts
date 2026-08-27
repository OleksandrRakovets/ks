import { MatchCreationDefinitionSchema, type MatchStateFor, type SparringMatchRejection } from '@ks/competition'
import type {
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
  | { readonly _tag: 'accepted'; readonly acceptedSeq: number }
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
      controlState: 'frame-active'
      state: MatchStateFor<K>
      latestSeq: number
      controlProjection: ControlProjectionFor<K>
      controlSections: ControlCommandSections
      participants: HydratedMatchParticipants
    }
  | {
      ok: true
      controlState: 'between-frames'
      state: MatchStateFor<K>
      latestSeq: number
      controlSections: ControlCommandSections
      participants: HydratedMatchParticipants
    }
  | ReadMatchFailure

export type SubmitMatchCommandResult =
  | { ok: true; outcome: CommandReceiptOutcome }
  | { ok: false; error: string; status: number }

export type ReadMatchProtocolResult<K extends RegisteredGameKey> =
  | {
      ok: true
      state: MatchStateFor<K>
      latestSeq: number
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
  submitMatchCommand<K extends RegisteredGameKey>(
    matchId: MatchId,
    commandId: CommandId,
    command: ControlCommand,
    expectedGameKey: K,
  ): Promise<SubmitMatchCommandResult>
  readMatchProtocol<K extends RegisteredGameKey>(
    matchId: MatchId,
    timeZone: string,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>>
  streamMatchUpdates(matchId: MatchId, since?: number): Promise<Response>
}
