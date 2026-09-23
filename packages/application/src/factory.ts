import type { D1Database } from '@cloudflare/workers-types'
import { type Clock, newMatchId } from '@ks/core'

import { archiveCompletedMatch, markMatchFinished } from './d1/completed-matches'
import { getOrCreateGuestPlayerRef } from './d1/guest-players'
import { activateMatch, beginMatchCreation } from './d1/match-lifecycle'
import {
  findCompletedMatchTime,
  getMatchRow,
  getMatchRows,
  listCompletedMatchRows,
  listLiveMatchRows,
} from './d1/matches'
import { hydrateParticipant } from './d1/players'
import { getProtocolArchive } from './d1/protocol-archives'
import { createApplicationDatabaseClient } from './d1/types'
import type { MatchRoomNamespace } from './match-room-client'
import { createApplicationWithDependencies } from './use-cases'

export type ApplicationBindings = {
  DB: D1Database
  MATCH_ROOM: MatchRoomNamespace
}

function newControlSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

type MatchRow = NonNullable<Awaited<ReturnType<typeof getMatchRow>>>

function matchRecordFromRow(row: MatchRow) {
  const identity = {
    matchId: row.matchId,
    gameKey: row.gameKey,
    createdAt: row.createdAt,
    participantRefs: {
      A: row.seatAPlayerRef,
      B: row.seatBPlayerRef,
    },
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

export function createApplication(bindings: ApplicationBindings, clock: Clock) {
  const db = createApplicationDatabaseClient(bindings.DB)

  return createApplicationWithDependencies({
    clock,
    newMatchId,
    newControlSecret,
    getOrCreateGuestPlayerRef: async (displayName) => getOrCreateGuestPlayerRef(db, displayName),
    hydrateParticipant: async (playerRef, locale) => hydrateParticipant(db, playerRef, locale),
    listLiveMatchRecords: async (since, locale) =>
      (await listLiveMatchRows(db, since, locale)).map((row) => ({
        ...matchRecordFromRow(row),
        participants: row.participants,
      })),
    listCompletedMatchRecords: async (range, locale) =>
      (await listCompletedMatchRows(db, range, locale)).map((row) => ({
        ...matchRecordFromRow(row),
        participants: row.participants,
      })),
    findCompletedMatchTime: async (query) => findCompletedMatchTime(db, query),
    getMatchRecord: async (matchId) => {
      const row = await getMatchRow(db, matchId)

      return row ? matchRecordFromRow(row) : null
    },
    getMatchRecords: async (matchIds) => (await getMatchRows(db, matchIds)).map(matchRecordFromRow),
    getProtocolArchive: async (matchId) => getProtocolArchive(db, matchId),
    beginMatchCreation: async (input) => beginMatchCreation(db, input),
    activateMatch: async (matchId) => activateMatch(db, matchId),
    archiveCompletedMatch: async (input) => archiveCompletedMatch(db, input),
    markMatchFinished: async (input) => markMatchFinished(db, input),
    matchRoomClient: (matchId) => bindings.MATCH_ROOM.getByName(matchId),
  })
}
