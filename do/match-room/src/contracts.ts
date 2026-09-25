import type { MatchRoomPresentation, MatchRoomProjection } from '@ks/competition'
import type {
  MatchId,
  MatchScoreProjection,
  MatchState,
  NonNegativeInteger,
  ProtocolEntry,
  UnixEpochMilliseconds,
} from '@ks/core'
import type { GameResult, RegisteredGameKey } from '@ks/gameplay/definitions'

type ActiveControlsResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly lastPlayerEntry: ProtocolEntry | null
} & MatchRoomProjection

type FinalizingControlsResult = FinalizingReadResult

export type GetControlsResult = ActiveControlsResult | FinalizingControlsResult

type ActiveProtocolResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly protocolEntries: readonly ProtocolReadEntry[]
} & MatchRoomPresentation

type FinalizingProtocolResult = FinalizingReadResult & {
  readonly protocolEntries: readonly ProtocolReadEntry[]
}

export type GetProtocolResult = ActiveProtocolResult | FinalizingProtocolResult

/** A canonical persisted Protocol Entry narrowed to its JSON-safe RPC representation. */
export type ProtocolReadEntry = Omit<ProtocolEntry, 'body'> & {
  readonly body: object
}

type ActiveScoreResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly score: MatchScoreProjection
}

type FinalizingScoreResult = {
  readonly _tag: 'finalizing'
  readonly latestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
  readonly score: MatchScoreProjection
}

export type GetScoreResult = ActiveScoreResult | FinalizingScoreResult

export type FinishedMatchTransfer = {
  readonly matchId: MatchId
  readonly gameKey: RegisteredGameKey
  readonly createdAt: UnixEpochMilliseconds
  readonly sourceLatestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
  readonly protocolEntries: readonly ProtocolEntry[]
  readonly finalState: MatchState
  readonly gameResult: GameResult | null
}

type FinalizingReadResult = {
  readonly _tag: 'finalizing'
  readonly state: MatchState
  readonly gameResult: GameResult | null
  readonly latestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
}
