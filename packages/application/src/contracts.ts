import { MatchCreationDefinition, type MatchStateFor, type SparringMatchRejection } from '@ks/competition'
import {
  type Control,
  type HydratedMatchParticipants,
  type MatchCommand,
  MatchId,
  MatchScoreProjection,
  NonNegativeInteger,
  PositiveInteger,
  UnixEpochMilliseconds,
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

type MatchListEntryIdentity = {
  matchId: MatchId
  gameKey: RegisteredGameKey
  shortGameTitle: string
  createdAtIso: string
  createdAtLabel: string
  participants: HydratedMatchParticipants
  latestSeq: NonNegativeInteger
  score: MatchScoreProjection
}

export type MatchListEntry = Readonly<
  MatchListEntryIdentity &
    ({ status: 'active'; endedAt: null } | { status: 'finished'; endedAt: UnixEpochMilliseconds })
>

export type MatchListScope = 'live' | 'completed'

export const MATCH_LIST_DEFAULT_PAGE_SIZE = 10

export const RECENT_COMPLETED_MATCH_WINDOW_MS = 15 * 60 * 1_000

export const MatchListPagination = v.pipe(
  v.object({ page: v.optional(PositiveInteger, 1) }),
  v.check(
    ({ page }) => Number.isSafeInteger((page - 1) * MATCH_LIST_DEFAULT_PAGE_SIZE),
    'Match list offset exceeds the safe integer range',
  ),
  v.readonly(),
)

export type MatchListPagination = v.InferOutput<typeof MatchListPagination>

export type MatchListPage = Readonly<{
  matches: readonly MatchListEntry[]
  page: PositiveInteger
  hasNextPage: boolean
  recentCompletionExpiresAfterMs?: number
}>

export const MATCH_SCORE_POLL_MAX_MATCHES = MATCH_LIST_DEFAULT_PAGE_SIZE

export const MatchScorePollEntry = v.pipe(
  v.intersect([
    v.object({
      matchId: MatchId,
      latestSeq: NonNegativeInteger,
      score: MatchScoreProjection,
    }),
    v.variant('status', [
      v.object({ status: v.literal('active'), endedAt: v.null() }),
      v.object({ status: v.literal('finished'), endedAt: UnixEpochMilliseconds }),
    ]),
  ]),
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
  listMatches(
    scope: MatchListScope,
    locale: SupportedLocale,
    pagination?: MatchListPagination,
  ): Promise<MatchListPage>
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
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>>
  admitSparringMatchLive(matchId: MatchId): Promise<SparringMatchLiveAdmission>
}
