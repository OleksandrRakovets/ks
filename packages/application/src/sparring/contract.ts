import type { MatchRejection } from '@ks/competition'
import { MatchCreationDefinition, MatchScoreProjection } from '@ks/competition/definitions'
import {
  type BySeatNumber,
  type Control,
  type GameConfiguration,
  type HydratedMatchParticipants,
  type InstantPresentation,
  type MatchCommand,
  MatchId,
  type MatchTargets,
  NonNegativeInteger,
  type Seat,
  UnixEpochMilliseconds,
} from '@ks/core'
import type { GameKey, GamePresentationFor } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type { LastCommandPresentation } from '../match/last-command-projection'
import type { ProtocolRow } from '../match/protocol-projection'
import { DisplayName } from '../player/contract'

export type { HydratedMatchParticipants } from '@ks/core'

type CommandReceiptOutcome =
  | { readonly _tag: 'accepted'; readonly acceptedSeq: number }
  | { readonly _tag: 'rejected'; readonly reason: MatchRejection }

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
  | { readonly ok: false; readonly reason: 'invalid-input' | 'initialization-conflict' }

export type DiscardMatchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unknown-match' | 'match-locked' }

type MatchListEntryIdentity = {
  matchId: MatchId
  gameKey: GameKey
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
  recentFinishedMatchExpiresAt?: UnixEpochMilliseconds
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

export type ReadMatchFailure = { readonly ok: false; readonly reason: 'unknown-match' }

export type ReadMatchScoresResult =
  | { readonly ok: true; readonly matches: readonly MatchScorePollEntry[] }
  | ReadMatchFailure

export type MatchReadFacts<K extends GameKey = GameKey> = Readonly<{
  ok: true
  matchId: MatchId
  gameKey: K
  latestSeq: number
  participants: HydratedMatchParticipants
  targets: MatchTargets
  framesWonBySeat: BySeatNumber
  /** Frame identified by the authoritative current index, even after award or Match end. */
  representedFrame: Readonly<{ frameIndex: number; pointsBySeat: BySeatNumber }> | null
}> &
  (
    | { readonly lifecycle: 'active'; readonly winnerSeat: null }
    | { readonly lifecycle: 'finished'; readonly winnerSeat: Seat }
  )

type ActiveRead<K extends GameKey> = Extract<MatchReadFacts<K>, { lifecycle: 'active' }> &
  /** A prepared gameplay frame is frame-active even before it has commenced. */
  (
    | { readonly controlPhase: 'frame-active'; readonly game: GamePresentationFor<K> }
    /** Complete match-level control phase between frames, distinct from tertiary overflow controls. */
    | { readonly controlPhase: 'between-frames'; readonly game?: never }
  )

export type ResultScores = Readonly<{
  kind: 'frames' | 'racks'
  rows: readonly Readonly<{ index: number; score: BySeatNumber }>[]
}>

export type ReadMatchResult<K extends GameKey> =
  | (ActiveRead<K> & {
      readonly controls: readonly Control[]
      /** Most recent uncorrected Accepted Command represented for the control surface. */
      readonly lastCommand?: LastCommandPresentation
    })
  | (Extract<MatchReadFacts<K>, { lifecycle: 'finished' }> & {
      readonly resultScores: ResultScores
      readonly endedAtIso: string
      readonly endedAtTime: string
      readonly endedAtDate: InstantPresentation['date']
      readonly endedAtIsToday: boolean
      readonly gameConfiguration?: GameConfiguration
    })
  | ReadMatchFailure

export type SubmitMatchCommandResult =
  | { readonly ok: true; readonly outcome: CommandReceiptOutcome }
  | {
      readonly ok: false
      readonly reason:
        | 'unknown-match'
        | 'match-finished'
        | 'match-locked'
        | 'invalid-command'
        | 'command-id-conflict'
    }

type SparringMatchLiveAdmission =
  | { readonly _tag: 'admitted' }
  | { readonly _tag: 'unknown' }
  | { readonly _tag: 'finished' }

export type ReadMatchProtocolResult<K extends GameKey> =
  | ((ActiveRead<K> | Extract<MatchReadFacts<K>, { lifecycle: 'finished' }>) & {
      readonly protocolRows: readonly ProtocolRow[]
    })
  | ReadMatchFailure

export type SparringApplication = {
  createMatch(input: CreateSparringMatchInput): Promise<CreateSparringMatchResult>
  discardMatch(matchId: MatchId, expectedGameKey: GameKey): Promise<DiscardMatchResult>
  listLiveMatches(locale: SupportedLocale): Promise<LiveMatchListPage>
  listFinishedMatches(locale: SupportedLocale, day?: MatchListDay): Promise<FinishedMatchListPage>
  readMatchScores(matchIds: readonly MatchId[]): Promise<ReadMatchScoresResult>
  readMatch<K extends GameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchResult<K>>
  submitMatchCommand(
    matchId: MatchId,
    command: MatchCommand,
    expectedGameKey: GameKey,
  ): Promise<SubmitMatchCommandResult>
  readMatchProtocol<K extends GameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>>
  admitMatchLive(matchId: MatchId): Promise<SparringMatchLiveAdmission>
}
