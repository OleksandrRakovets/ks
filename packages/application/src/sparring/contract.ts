import { MatchCreationDefinition, MatchScoreProjection } from '@ks/competition/definitions'
import {
  type BySeatNumber,
  type Control,
  type GameConfiguration,
  type HydratedMatchParticipants,
  type InstantPresentation,
  MatchId,
  type MatchTargets,
  NonNegativeInteger,
  type Seat,
  UnixEpochMilliseconds,
} from '@ks/core'
import type { GameKey, GamePresentationFor } from '@ks/gameplay/definitions'
import { Schema } from 'effect'

import type { LastCommandPresentation } from '../match/last-command-projection'
import type { ProtocolRow } from '../match/protocol-projection'
import { DisplayName } from '../player/contract'

export { HydratedMatchParticipants } from '@ks/core'

export const CreateSparringMatchInput = MatchCreationDefinition.mapFields(
  (fields) => ({ ...fields, playerNames: Schema.Struct({ A: DisplayName, B: DisplayName }) }),
  { unsafePreserveChecks: true },
).check(
  Schema.makeFilter((value) => value.playerNames.A !== value.playerNames.B, {
    expected: 'Players must have different display names',
  }),
)

type MatchListEntryIdentity = {
  matchId: typeof MatchId.Type
  gameKey: typeof GameKey.Type
  shortGameTitle: string
  createdAtIso: string
  createdAtLabel: string
  createdAtDate: InstantPresentation['date']
  createdAtIsToday: boolean
  participants: typeof HydratedMatchParticipants.Type
  latestSeq: typeof NonNegativeInteger.Type
  score: typeof MatchScoreProjection.Type
  hasCustomFrameTarget: boolean
}

export type MatchListEntry = Readonly<
  MatchListEntryIdentity &
    ({ status: 'active'; endedAt: null } | { status: 'finished'; endedAt: typeof UnixEpochMilliseconds.Type })
>

export const MatchListDay = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter((day) => {
    const instant = Date.parse(`${day}T00:00:00Z`)

    return Number.isFinite(instant) && instant >= 0 && new Date(instant).toISOString().slice(0, 10) === day
  }),
)

export type LiveMatchListPage = Readonly<{
  scope: 'live'
  matches: readonly MatchListEntry[]
  recentFinishedMatchExpiresAfterMs?: number
}>

export type FinishedMatchListPage = Readonly<{
  scope: 'finished'
  matches: readonly MatchListEntry[]
  day: typeof MatchListDay.Type | null
  previousDay: typeof MatchListDay.Type | null
  nextDay: typeof MatchListDay.Type | null
  isToday: boolean
}>

export type MatchListPage = LiveMatchListPage | FinishedMatchListPage

const MatchScorePollFields = {
  matchId: MatchId,
  latestSeq: NonNegativeInteger,
  score: MatchScoreProjection,
}

export const MatchScorePollEntry = Schema.Union([
  Schema.Struct({ ...MatchScorePollFields, status: Schema.Literal('active'), endedAt: Schema.Null }),
  Schema.Struct({
    ...MatchScorePollFields,
    status: Schema.Literal('finished'),
    endedAt: UnixEpochMilliseconds,
  }),
])

export const MatchScorePollResponse = Schema.Struct({
  matches: Schema.Array(MatchScorePollEntry),
})

export type MatchReadFacts<K extends typeof GameKey.Type = typeof GameKey.Type> = Readonly<{
  matchId: typeof MatchId.Type
  gameKey: K
  latestSeq: number
  participants: typeof HydratedMatchParticipants.Type
  targets: typeof MatchTargets.Type
  framesWonBySeat: typeof BySeatNumber.Type
  /** Frame identified by the authoritative current index, even after award or Match end. */
  representedFrame: Readonly<{ frameIndex: number; pointsBySeat: typeof BySeatNumber.Type }> | null
}> &
  (
    | { readonly lifecycle: 'active'; readonly winnerSeat: null }
    | { readonly lifecycle: 'finished'; readonly winnerSeat: typeof Seat.Type }
  )

type ActiveRead<K extends typeof GameKey.Type> = Extract<MatchReadFacts<K>, { lifecycle: 'active' }> &
  /** A prepared gameplay frame is frame-active even before it has commenced. */
  (
    | { readonly controlPhase: 'frame-active'; readonly game: GamePresentationFor<K> }
    /** Complete match-level control phase between frames, distinct from tertiary overflow controls. */
    | { readonly controlPhase: 'between-frames'; readonly game?: never }
  )

export type ResultScores = Readonly<{
  kind: 'frames' | 'racks'
  rows: readonly Readonly<{ index: number; score: typeof BySeatNumber.Type }>[]
}>

export type ReadMatchResult<K extends typeof GameKey.Type> =
  | (ActiveRead<K> & {
      readonly controls: readonly (typeof Control.Type)[]
      /** Most recent uncorrected Accepted Command represented for the control surface. */
      readonly lastCommand?: LastCommandPresentation
    })
  | (Extract<MatchReadFacts<K>, { lifecycle: 'finished' }> & {
      readonly resultScores: ResultScores
      readonly endedAtIso: string
      readonly endedAtTime: string
      readonly endedAtDate: InstantPresentation['date']
      readonly endedAtIsToday: boolean
      readonly gameConfiguration?: typeof GameConfiguration.Type
    })

export type ReadMatchProtocolResult<K extends typeof GameKey.Type> = (
  | ActiveRead<K>
  | Extract<MatchReadFacts<K>, { lifecycle: 'finished' }>
) & {
  readonly protocolRows: readonly ProtocolRow[]
}
