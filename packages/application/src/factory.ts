import type { D1Database } from '@cloudflare/workers-types'
import { newMatchId } from '@ks/core'

import { getOrCreateGuestPlayerRef } from './d1/guest-players'
import { getMatchControlSecret, getMatchParticipantRefs, listMatchRows, listStoredFacts } from './d1/matches'
import { hydrateParticipant } from './d1/players'
import { getProtocolArchive } from './d1/protocol-archives'
import { createApplicationDatabase } from './d1/types'
import { createMatchRoomClient } from './match-room-client'
import { createApplicationWithDependencies } from './use-cases'

export type ApplicationBindings = {
  DB: D1Database
  MATCH_ROOM: { getByName(name: string): object }
}

function newControlSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function createApplication(bindings: ApplicationBindings) {
  const db = createApplicationDatabase(bindings.DB)
  return createApplicationWithDependencies({
    newMatchId,
    newControlSecret,
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
    getMatchControlSecret: async (matchId) => await getMatchControlSecret(db, matchId),
    listStoredFacts: async (matchId) => await listStoredFacts(db, matchId),
    getProtocolArchive: async (matchId) => await getProtocolArchive(db, matchId),
    matchRoom: createMatchRoomClient(bindings.MATCH_ROOM),
  })
}
