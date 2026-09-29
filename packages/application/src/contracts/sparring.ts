import { MatchCreationDefinition, type MatchRejection, type MatchStateFor } from '@ks/competition'
import {
  type Control,
  type HydratedMatchParticipants,
  type InstantPresentation,
  type MatchCommand,
  MatchId,
  MatchScoreProjection,
  NonNegativeInteger,
  UnixEpochMilliseconds,
} from '@ks/core'
import type { GamePresentationFor, GameResult, RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type { LastCommandPresentation } from '../control'
import type { ProtocolRow } from '../protocol'

export type { HydratedMatchParticipant, HydratedMatchParticipants } from '@ks/core'

type CommandReceiptOutcome =
  | { readonly _tag: 'accepted'; readonly acceptedSeq: number }
  | { readonly _tag: 'rejected'; readonly reason: MatchRejection }

export const DisplayName = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.replace(/\s+/g, ' ')),
  v.minLength(1),
  // "I Lastname" becomes "I. Lastname" when hydrated, so creation reserves one character for the short form.
  v.maxLength(127),
)

export type DisplayName = v.InferOutput<typeof DisplayName>

export const CreateSparringMatchInput = v.pipe(
  v.intersect([
    MatchCreationDefinition,
    v.object({
      playerNames: v.pipe(v.object({ A: DisplayName, B: DisplayName }), v.readonly()),
    }),
  ]),
  v.check((value) => value.playerNames.A !== value.playerNames.B, 'Players must have different display names'),
  v.readonly(),
)

export type CreateSparringMatchInput = v.InferOutput<typeof CreateSparringMatchInput>

export type CreateSparringMatchResult =
  | { readonly ok: true; readonly matchId: MatchId }
  | { readonly ok: false; readonly error: string; readonly status: number }

type MatchListEntryIdentity = {
  matchId: MatchId
  gameKey: RegisteredGameKey
  shortGameTitle: string
  createdAtIso: string
  createdAtLabel: string
  createdAtDate: InstantPresentation['date']
  createdAtIsToday: boolean
  participants: HydratedMatchParticipants
  latestSeq: NonNegativeInteger
  score: MatchScoreProjection
  hasCustomFrameTarget: boolean
}

export type MatchListEntry = Readonly<
  MatchListEntryIdentity &
    ({ status: 'active'; endedAt: null } | { status: 'finished'; endedAt: UnixEpochMilliseconds })
>

export const RECENT_FINISHED_MATCH_WINDOW_MS = 15 * 60 * 1_000

export const MatchListDay = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/),
  v.check((day) => {
    const instant = Date.parse(`${day}T00:00:00Z`)

    return Number.isFinite(instant) && instant >= 0 && new Date(instant).toISOString().slice(0, 10) === day
  }),
)

export type MatchListDay = v.InferOutput<typeof MatchListDay>

export type LiveMatchListPage = Readonly<{
  scope: 'live'
  matches: readonly MatchListEntry[]
  recentFinishedMatchExpiresAfterMs?: number
}>

export type FinishedMatchListPage = Readonly<{
  scope: 'finished'
  matches: readonly MatchListEntry[]
  day: MatchListDay | null
  previousDay: MatchListDay | null
  nextDay: MatchListDay | null
  isToday: boolean
}>

export type MatchListPage = LiveMatchListPage | FinishedMatchListPage

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
    matches: v.pipe(v.array(MatchScorePollEntry), v.readonly()),
  }),
  v.readonly(),
)

export type MatchScorePollResponse = v.InferOutput<typeof MatchScorePollResponse>

export type ReadMatchFailure = { readonly ok: false; readonly error: string; readonly status: number }

export type ReadMatchScoresResult =
  | { readonly ok: true; readonly matches: readonly MatchScorePollEntry[] }
  | ReadMatchFailure

type MatchStateForLifecycle<
  K extends RegisteredGameKey,
  Lifecycle extends 'active' | 'finished',
> = MatchStateFor<K> & { readonly status: Lifecycle }

export type ReadMatchResult<K extends RegisteredGameKey> =
  /** A prepared gameplay frame is frame-active even before it has commenced. */
  | {
      readonly ok: true
      readonly lifecycle: 'active'
      readonly controlPhase: 'frame-active'
      readonly state: MatchStateForLifecycle<K, 'active'>
      readonly latestSeq: number
      readonly game: GamePresentationFor<K>
      readonly controls: readonly Control[]
      readonly participants: HydratedMatchParticipants
      /** Most recent uncorrected Accepted Command represented for the control surface. */
      readonly lastCommand?: LastCommandPresentation
    }
  | {
      readonly ok: true
      readonly lifecycle: 'active'
      /** Complete match-level control phase between frames, distinct from tertiary overflow controls. */
      readonly controlPhase: 'between-frames'
      readonly state: MatchStateForLifecycle<K, 'active'>
      readonly latestSeq: number
      readonly game?: never
      readonly controls: readonly Control[]
      readonly participants: HydratedMatchParticipants
      /** Most recent uncorrected Accepted Command represented for the control surface. */
      readonly lastCommand?: LastCommandPresentation
    }
  | {
      readonly ok: true
      readonly lifecycle: 'finished'
      readonly state: MatchStateForLifecycle<K, 'finished'>
      readonly latestSeq: number
      readonly endedAtIso: string
      readonly endedAtTime: string
      readonly endedAtDate: InstantPresentation['date']
      readonly endedAtIsToday: boolean
      readonly game?: never
      readonly gameResult: GameResult | null
      readonly participants: HydratedMatchParticipants
      readonly hasCustomFrameTarget: boolean
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
  | {
      readonly ok: true
      readonly lifecycle: 'active'
      readonly controlPhase: 'frame-active'
      readonly state: MatchStateForLifecycle<K, 'active'>
      readonly latestSeq: number
      readonly game: GamePresentationFor<K>
      readonly participants: HydratedMatchParticipants
      readonly protocolRows: readonly ProtocolRow[]
    }
  | {
      readonly ok: true
      readonly lifecycle: 'active'
      readonly controlPhase: 'between-frames'
      readonly state: MatchStateForLifecycle<K, 'active'>
      readonly latestSeq: number
      readonly game?: never
      readonly participants: HydratedMatchParticipants
      readonly protocolRows: readonly ProtocolRow[]
    }
  | (Extract<ReadMatchResult<K>, { readonly ok: true; readonly lifecycle: 'finished' }> & {
      readonly protocolRows: readonly ProtocolRow[]
    })
  | ReadMatchFailure

export type SparringApplication = {
  createMatch(input: CreateSparringMatchInput): Promise<CreateSparringMatchResult>
  listLiveMatches(locale: SupportedLocale): Promise<LiveMatchListPage>
  listFinishedMatches(locale: SupportedLocale, day?: MatchListDay): Promise<FinishedMatchListPage>
  readMatchScores(matchIds: readonly MatchId[]): Promise<ReadMatchScoresResult>
  readMatch<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchResult<K>>
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
  admitMatchLive(matchId: MatchId): Promise<SparringMatchLiveAdmission>
}
