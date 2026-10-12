import { MatchScoreProjection, type MatchState, type ProtocolEntries } from '@ks/competition'
import { MatchId, NonNegativeInteger, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { GameKey, type GameResult } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import {
  type guestPlayers,
  type sparringMatches,
  StoredMatchStatus,
  type verifiedPlayers,
} from '../../d1/schema'
import { type ParticipantRecord, participantRecordFromRow } from '../../player/storage/records'

export type MatchCreationRecord = Readonly<{
  matchId: MatchId
  gameKey: GameKey
  createdAt: UnixEpochMilliseconds
  participantRefs: Readonly<{ A: PlayerRef; B: PlayerRef }>
}>

export type MatchRecord = MatchCreationRecord &
  (
    | Readonly<{ status: 'creating' | 'active' }>
    | Readonly<{ status: 'discarded'; endedAt: UnixEpochMilliseconds }>
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

const MatchRowIdentity = {
  matchId: MatchId,
  gameKey: GameKey,
  createdAt: UnixEpochMilliseconds,
  seatAPlayerRef: PlayerRef,
  seatBPlayerRef: PlayerRef,
}

export const MatchRow = v.pipe(
  v.variant('status', [
    v.object({
      ...MatchRowIdentity,
      status: v.literal(StoredMatchStatus.creating),
      endedAt: v.nullable(UnixEpochMilliseconds),
      finalSourceLatestSeq: v.null(),
      finalScore: v.null(),
    }),
    v.object({
      ...MatchRowIdentity,
      status: v.literal(StoredMatchStatus.active),
      endedAt: v.nullable(UnixEpochMilliseconds),
      finalSourceLatestSeq: v.null(),
      finalScore: v.null(),
    }),
    v.object({
      ...MatchRowIdentity,
      status: v.literal(StoredMatchStatus.discarded),
      endedAt: UnixEpochMilliseconds,
      finalSourceLatestSeq: v.null(),
      finalScore: v.null(),
    }),
    v.pipe(
      v.object({
        ...MatchRowIdentity,
        status: v.literal(StoredMatchStatus.finished),
        endedAt: UnixEpochMilliseconds,
        finalSourceLatestSeq: NonNegativeInteger,
        finalScore: v.pipe(v.string(), v.parseJson(), MatchScoreProjection),
      }),
      v.check((row) => row.finalScore.activeFrame === null, 'Finished Match row has an active Frame'),
      v.check((row) => row.finalScore.winnerSeat !== null, 'Finished Match row has no winner'),
    ),
  ]),
  v.readonly(),
)

export type MatchRow = v.InferOutput<typeof MatchRow>

export function matchRecordFromRow(row: MatchRow): MatchRecord {
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
    : row.status === 'discarded'
      ? { ...identity, status: row.status, endedAt: row.endedAt }
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
  const match = v.parse(MatchRow, row)

  return {
    ...matchRecordFromRow(match),
    participants: {
      A: participantRecordFromRow(match.seatAPlayerRef, row.seatAGuest ?? row.seatAVerified),
      B: participantRecordFromRow(match.seatBPlayerRef, row.seatBGuest ?? row.seatBVerified),
    },
  }
}
