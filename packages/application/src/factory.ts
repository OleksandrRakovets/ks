import type { D1Database } from '@cloudflare/workers-types'
import { newMatchId } from '@ks/core'

import { getOrCreateGuestPlayerRef } from './d1/guest-players'
import { getMatchControlSecret, getMatchParticipantRefs, listMatchRows, listStoredFacts } from './d1/matches'
import { hydrateParticipant } from './d1/players'
import { getProtocolArchive } from './d1/protocol-archives'
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
  const db = bindings.DB
  return createApplicationWithDependencies({
    newMatchId,
    newControlSecret,
    getOrCreateGuestPlayerRef: async (displayName) => await getOrCreateGuestPlayerRef(db, displayName),
    hydrateParticipant: async (playerRef, locale) => await hydrateParticipant(db, playerRef, locale),
    listMatchRecords: async () =>
      (await listMatchRows(db)).map((row) => ({
        matchId: row.match_id,
        gameKey: row.game_key,
        status: row.status,
        createdAt: row.created_at,
        participantRefs: { A: row.seat_a_player_ref, B: row.seat_b_player_ref },
      })),
    getMatchParticipantRefs: async (matchId) => await getMatchParticipantRefs(db, matchId),
    getMatchControlSecret: async (matchId) => await getMatchControlSecret(db, matchId),
    listStoredFacts: async (matchId) => await listStoredFacts(db, matchId),
    getProtocolArchive: async (matchId) => await getProtocolArchive(db, matchId),
    matchRoom: createMatchRoomClient(bindings.MATCH_ROOM),
  })
}
