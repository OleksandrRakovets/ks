import { MatchCreationDefinition, type MatchStateFor, type SparringMatchRejection } from '@ks/competition'
import type {
  ControlSections,
  HydratedMatchParticipants,
  MatchCommand,
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

export const DisplayName = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.replace(/\s+/g, ' ')),
  v.minLength(1),
  // "I Lastname" becomes "I. Lastname" when hydrated, so creation reserves one character for the short form.
  v.maxLength(127),
)
export type DisplayName = v.InferOutput<typeof DisplayName>

export const CreateMatchInput = v.pipe(
  v.intersect([
    MatchCreationDefinition,
    v.object({
      playerNames: v.pipe(v.object({ A: DisplayName, B: DisplayName }), v.readonly()),
    }),
  ]),
  v.check((value) => value.playerNames.A !== value.playerNames.B, 'Players must have different display names'),
  v.readonly(),
)
export type CreateMatchInput = v.InferOutput<typeof CreateMatchInput>

export type CreateMatchResult =
  | { readonly ok: true; readonly matchId: MatchId }
  | { readonly ok: false; readonly error: string; readonly status: number }

export type MatchListEntry = Readonly<{
  matchId: MatchId
  gameKey: RegisteredGameKey
  gameTitle: string
  status: 'active' | 'finished'
  createdAt: UnixEpochMilliseconds
  participants: HydratedMatchParticipants
}>

export type ReadMatchFailure = { readonly ok: false; readonly error: string; readonly status: number }

export type ReadMatchControlResult<K extends RegisteredGameKey> =
  | {
      readonly ok: true
      readonly controlState: 'frame-active'
      readonly state: MatchStateFor<K>
      readonly latestSeq: number
      readonly controlProjection: ControlProjectionFor<K>
      readonly controlSections: ControlSections
      readonly participants: HydratedMatchParticipants
    }
  | {
      readonly ok: true
      readonly controlState: 'between-frames'
      readonly state: MatchStateFor<K>
      readonly latestSeq: number
      readonly controlSections: ControlSections
      readonly participants: HydratedMatchParticipants
    }
  | ReadMatchFailure

export type SubmitMatchCommandResult =
  | { readonly ok: true; readonly outcome: CommandReceiptOutcome }
  | { readonly ok: false; readonly error: string; readonly status: number }

export type ReadMatchProtocolResult<K extends RegisteredGameKey> =
  | {
      readonly ok: true
      readonly state: MatchStateFor<K>
      readonly latestSeq: number
      readonly participants: HydratedMatchParticipants
      readonly protocolRows: readonly ProtocolRow[]
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
    command: MatchCommand,
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
