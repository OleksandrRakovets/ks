import { MatchCreationDefinition, type MatchStateFor, type SparringMatchRejection } from '@ks/competition'
import {
  type Control,
  type HydratedMatchParticipants,
  type MatchCommand,
  MatchId,
  MatchScoreProjection,
  NonNegativeInteger,
  PositiveInteger,
  type UnixEpochMilliseconds,
} from '@ks/core'
import type { GamePresentationFor, RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type { ProtocolRow } from './protocol'

export type { HydratedMatchParticipant, HydratedMatchParticipants } from '@ks/core'

type CommandReceiptOutcome =
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
  shortGameTitle: string
  status: 'active' | 'finished'
  createdAt: UnixEpochMilliseconds
  participants: HydratedMatchParticipants
  latestSeq: NonNegativeInteger
  score: MatchScoreProjection
}>

export const MATCH_LIST_DEFAULT_PAGE_SIZE = 10

export const MATCH_LIST_MAX_PAGE_SIZE = 20

export const MatchListPagination = v.pipe(
  v.object({
    page: v.optional(PositiveInteger, 1),
    pageSize: v.optional(
      v.pipe(PositiveInteger, v.maxValue(MATCH_LIST_MAX_PAGE_SIZE)),
      MATCH_LIST_DEFAULT_PAGE_SIZE,
    ),
  }),
  v.check(
    ({ page, pageSize }) => Number.isSafeInteger((page - 1) * pageSize),
    'Match list offset exceeds the safe integer range',
  ),
  v.readonly(),
)

export type MatchListPagination = v.InferOutput<typeof MatchListPagination>

export type MatchListPage = Readonly<{
  matches: readonly MatchListEntry[]
  page: PositiveInteger
  pageSize: PositiveInteger
  hasNextPage: boolean
}>

export const MATCH_SCORE_POLL_MAX_MATCHES = MATCH_LIST_MAX_PAGE_SIZE

export const MatchScorePollEntry = v.pipe(
  v.object({
    matchId: MatchId,
    status: v.picklist(['active', 'finished']),
    latestSeq: NonNegativeInteger,
    score: MatchScoreProjection,
  }),
  v.readonly(),
)

export type MatchScorePollEntry = v.InferOutput<typeof MatchScorePollEntry>

export const MatchScorePollResponse = v.pipe(
  v.object({
    matches: v.pipe(v.array(MatchScorePollEntry), v.maxLength(MATCH_SCORE_POLL_MAX_MATCHES), v.readonly()),
  }),
  v.readonly(),
)

export type MatchScorePollResponse = v.InferOutput<typeof MatchScorePollResponse>

export type ReadMatchFailure = { readonly ok: false; readonly error: string; readonly status: number }

export type ReadMatchScoresResult =
  | { readonly ok: true; readonly matches: readonly MatchScorePollEntry[] }
  | ReadMatchFailure

export type ReadMatchControlResult<K extends RegisteredGameKey> =
  /** A prepared gameplay frame is frame-active even before it has commenced. */
  | {
      readonly ok: true
      readonly controlState: 'frame-active'
      readonly state: MatchStateFor<K>
      readonly latestSeq: number
      readonly game: GamePresentationFor<K>
      readonly controls: readonly Control[]
      readonly participants: HydratedMatchParticipants
      /** Most recent player-authored Protocol row suitable for the control surface's confirmation line. */
      readonly lastEntry?: Pick<ProtocolRow, 'key' | 'message' | 'score'>
    }
  | {
      readonly ok: true
      readonly controlState: 'between-frames'
      readonly state: MatchStateFor<K>
      readonly latestSeq: number
      readonly game?: never
      readonly controls: readonly Control[]
      readonly participants: HydratedMatchParticipants
      /** Most recent player-authored Protocol row suitable for the control surface's confirmation line. */
      readonly lastEntry?: Pick<ProtocolRow, 'key' | 'message' | 'score'>
    }
  | {
      readonly ok: true
      readonly controlState: 'finished'
      readonly state: MatchStateFor<K>
      readonly latestSeq: number
      readonly game?: never
      readonly controls: readonly []
      readonly participants: HydratedMatchParticipants
    }
  | ReadMatchFailure

export type SubmitMatchCommandResult =
  | { readonly ok: true; readonly outcome: CommandReceiptOutcome }
  | { readonly ok: false; readonly error: string; readonly status: number }

export type SparringMatchLiveAdmission =
  | { readonly _tag: 'admitted' }
  | { readonly _tag: 'unknown' }
  | { readonly _tag: 'finished' }

export type ReadMatchProtocolResult<K extends RegisteredGameKey> =
  | (Extract<ReadMatchControlResult<K>, { readonly ok: true }> & {
      readonly protocolRows: readonly ProtocolRow[]
    })
  | ReadMatchFailure

export type Application = {
  createMatch(input: CreateMatchInput): Promise<CreateMatchResult>
  listMatches(locale: SupportedLocale, pagination?: MatchListPagination): Promise<MatchListPage>
  readMatchScores(matchIds: readonly MatchId[]): Promise<ReadMatchScoresResult>
  readMatchControl<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchControlResult<K>>
  submitMatchCommand(
    matchId: MatchId,
    command: MatchCommand,
    expectedGameKey: RegisteredGameKey,
  ): Promise<SubmitMatchCommandResult>
  readMatchProtocol<K extends RegisteredGameKey>(
    matchId: MatchId,
    timeZone: string,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>>
  admitSparringMatchLive(matchId: MatchId): Promise<SparringMatchLiveAdmission>
}
