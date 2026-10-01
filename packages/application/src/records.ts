import type { MatchScoreProjection, MatchState, ProtocolEntries } from '@ks/competition'
import type { MatchId, NonNegativeInteger, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import type { GameKey, GameResult } from '@ks/gameplay/definitions'

export type PlayerName = Readonly<{ firstName: string; lastName: string }>

export type ParticipantRecord = Readonly<{
  playerRef: PlayerRef
  names: Readonly<{ uk: PlayerName; en: PlayerName }> | null
}>

export type MatchCreationRecord = Readonly<{
  matchId: MatchId
  gameKey: GameKey
  createdAt: UnixEpochMilliseconds
  participantRefs: Readonly<{ A: PlayerRef; B: PlayerRef }>
}>

export type MatchRecord = MatchCreationRecord &
  (
    | Readonly<{ status: 'creating' | 'active' }>
    | Readonly<{
        status: 'finished'
        endedAt: UnixEpochMilliseconds
        finalSourceLatestSeq: NonNegativeInteger
        finalScore: MatchScoreProjection
      }>
  )

export type MatchListRecord = MatchRecord &
  Readonly<{ participants: Readonly<{ A: ParticipantRecord; B: ParticipantRecord }> }>

type ArchiveStateRecord = Readonly<{
  sourceLatestSeq: number
  state: Extract<MatchState, { status: 'finished' }>
  gameResult: GameResult | null
}>

export type FinishedMatchArchiveRecord = ArchiveStateRecord & Readonly<{ entries?: never }>

export type ProtocolArchiveRecord = ArchiveStateRecord &
  Readonly<{ protocolVersion: number; entries: ProtocolEntries }>
