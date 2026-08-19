import type { D1Database } from '@cloudflare/workers-types'
import { newMatchId, nowUnixEpochMilliseconds } from '@ks/core'

import { archiveCompletedMatch, finishCompletedMatch } from './d1/completed-matches'
import { getOrCreateGuestPlayerRef } from './d1/guest-players'
import { activateMatch, beginMatchCreation } from './d1/match-lifecycle'
import { getMatchRow, listMatchRows } from './d1/matches'
import { hydrateParticipant } from './d1/players'
import { getProtocolArchive } from './d1/protocol-archives'
import { createApplicationDatabaseClient } from './d1/types'
import { createMatchRoomClient } from './match-room-client'
import { createApplicationWithDependencies } from './use-cases'

export type ApplicationBindings = {
  DB: D1Database
  MATCH_ROOM: Parameters<typeof createMatchRoomClient>[0]
}

function newControlSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function createApplication(bindings: ApplicationBindings) {
  const db = createApplicationDatabaseClient(bindings.DB)
  return createApplicationWithDependencies({
    newMatchId,
    newControlSecret,
    now: nowUnixEpochMilliseconds,
    getOrCreateGuestPlayerRef: async (displayName) => await getOrCreateGuestPlayerRef(db, displayName),
    hydrateParticipant: async (playerRef, locale) => await hydrateParticipant(db, playerRef, locale),
    listMatchRecords: async () =>
      (await listMatchRows(db)).map((row) => ({
        matchId: row.matchId,
        gameKey: row.gameKey,
        status: row.status,
        createdAt: row.createdAt,
        participantRefs: { A: row.seatAPlayerRef, B: row.seatBPlayerRef },
      })),
    getMatchRecord: async (matchId) => {
      const row = await getMatchRow(db, matchId)
      return row
        ? {
            matchId: row.matchId,
            gameKey: row.gameKey,
            status: row.status,
            createdAt: row.createdAt,
            participantRefs: { A: row.seatAPlayerRef, B: row.seatBPlayerRef },
          }
        : null
    },
    getProtocolArchive: async (matchId) => await getProtocolArchive(db, matchId),
    beginMatchCreation: async (input) => await beginMatchCreation(db, input),
    activateMatch: async (matchId) => await activateMatch(db, matchId),
    archiveCompletedMatch: async (input) => await archiveCompletedMatch(db, input),
    finishCompletedMatch: async (matchId) => await finishCompletedMatch(db, matchId),
    matchRoom: createMatchRoomClient(bindings.MATCH_ROOM),
  })
}
