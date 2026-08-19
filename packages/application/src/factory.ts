import type { D1Database } from '@cloudflare/workers-types'
import { newMatchId } from '@ks/core'
import type { MatchRoom } from '@ks/match-room'

import { getOrCreateGuestPlayerRef } from './d1/guest-players'
import { activateMatch, beginMatchCreation, recordCompletedMatch } from './d1/match-lifecycle'
import { getMatchParticipantRefs, listMatchRows } from './d1/matches'
import { hydrateParticipant } from './d1/players'
import { getProtocolArchive } from './d1/protocol-archives'
import { createApplicationDatabaseClient } from './d1/types'
import { createMatchRoomClient } from './match-room-client'
import { createApplicationWithDependencies } from './use-cases'

export type ApplicationBindings = {
  DB: D1Database
  MATCH_ROOM: DurableObjectNamespace<MatchRoom>
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
    now: Date.now,
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
    getMatchParticipantRefs: async (matchId) => await getMatchParticipantRefs(db, matchId),
    listActiveFacts: async (matchId) => await createMatchRoomClient(bindings.MATCH_ROOM).facts(matchId),
    getProtocolArchive: async (matchId) => await getProtocolArchive(db, matchId),
    beginMatchCreation: async (input) => await beginMatchCreation(db, input),
    activateMatch: async (matchId) => await activateMatch(db, matchId),
    recordCompletedMatch: async (input) => await recordCompletedMatch(db, input),
    matchRoom: createMatchRoomClient(bindings.MATCH_ROOM),
  })
}
