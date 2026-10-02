import { MatchScoreProjection, type MatchState, type ProtocolEntries } from '@ks/competition'
import { MatchId, NonNegativeInteger, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { GameKey, type GameResult } from '@ks/gameplay/definitions'
import { Schema } from 'effect'

import {
  type guestPlayers,
  type sparringMatches,
  StoredMatchStatus,
  type verifiedPlayers,
} from '../../d1/schema'
import { type ParticipantRecord, participantRecordFromRow } from '../../player/storage/records'

export type MatchCreationRecord = Readonly<{
  matchId: typeof MatchId.Type
  gameKey: typeof GameKey.Type
  createdAt: typeof UnixEpochMilliseconds.Type
  participantRefs: Readonly<{ A: typeof PlayerRef.Type; B: typeof PlayerRef.Type }>
}>

export type MatchRecord = MatchCreationRecord &
  (
    | Readonly<{ status: 'creating' | 'active' }>
    | Readonly<{
        status: 'finished'
        endedAt: typeof UnixEpochMilliseconds.Type
        finalSourceLatestSeq: typeof NonNegativeInteger.Type
        finalScore: typeof MatchScoreProjection.Type
      }>
  )

export type MatchListRecord = MatchRecord &
  Readonly<{ participants: Readonly<{ A: ParticipantRecord; B: ParticipantRecord }> }>

type ArchiveStateRecord = Readonly<{
  sourceLatestSeq: number
  state: Extract<typeof MatchState.Type, { status: 'finished' }>
  gameResult: typeof GameResult.Type | null
}>

export type FinishedMatchArchiveRecord = ArchiveStateRecord & Readonly<{ entries?: never }>

export type ProtocolArchiveRecord = ArchiveStateRecord &
  Readonly<{ protocolVersion: number; entries: typeof ProtocolEntries.Type }>

const MatchRowIdentity = {
  matchId: MatchId,
  gameKey: GameKey,
  createdAt: UnixEpochMilliseconds,
  seatAPlayerRef: PlayerRef,
  seatBPlayerRef: PlayerRef,
}

export const MatchRow = Schema.Union([
  Schema.Struct({
    ...MatchRowIdentity,
    status: Schema.Literal(StoredMatchStatus.creating),
    endedAt: Schema.NullOr(UnixEpochMilliseconds),
    finalSourceLatestSeq: Schema.Null,
    finalScore: Schema.Null,
  }),
  Schema.Struct({
    ...MatchRowIdentity,
    status: Schema.Literal(StoredMatchStatus.active),
    endedAt: Schema.NullOr(UnixEpochMilliseconds),
    finalSourceLatestSeq: Schema.Null,
    finalScore: Schema.Null,
  }),
  Schema.Struct({
    ...MatchRowIdentity,
    status: Schema.Literal(StoredMatchStatus.finished),
    endedAt: UnixEpochMilliseconds,
    finalSourceLatestSeq: NonNegativeInteger,
    finalScore: Schema.fromJsonString(MatchScoreProjection),
  }).check(
    Schema.makeFilter((row) => row.finalScore.activeFrame === null, {
      expected: 'Finished Match row has an active Frame',
    }),
    Schema.makeFilter((row) => row.finalScore.winnerSeat !== null, {
      expected: 'Finished Match row has no winner',
    }),
  ),
])

export function matchRecordFromRow(row: typeof MatchRow.Type): MatchRecord {
  const identity = {
    matchId: row.matchId,
    gameKey: row.gameKey,
    createdAt: row.createdAt,
    participantRefs: { A: row.seatAPlayerRef, B: row.seatBPlayerRef },
  }

  return row.status === 'finished'
    ? {
        ...identity,
        status: row.status,
        endedAt: row.endedAt,
        finalSourceLatestSeq: row.finalSourceLatestSeq,
        finalScore: row.finalScore,
      }
    : { ...identity, status: row.status }
}

export function matchListRecordFromRow(
  row: Omit<typeof sparringMatches.$inferSelect, 'finalScoreJson'> & {
    finalScore: string | null
    seatAGuest: typeof guestPlayers.$inferSelect | null
    seatAVerified: typeof verifiedPlayers.$inferSelect | null
    seatBGuest: typeof guestPlayers.$inferSelect | null
    seatBVerified: typeof verifiedPlayers.$inferSelect | null
  },
): MatchListRecord {
  const match = Schema.decodeUnknownSync(MatchRow)(row)

  return {
    ...matchRecordFromRow(match),
    participants: {
      A: participantRecordFromRow(match.seatAPlayerRef, row.seatAGuest ?? row.seatAVerified),
      B: participantRecordFromRow(match.seatBPlayerRef, row.seatBGuest ?? row.seatBVerified),
    },
  }
}
