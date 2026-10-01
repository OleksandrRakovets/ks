/** Server-only application composition over D1 and the MatchRoom binding. */
import type { D1Database } from '@cloudflare/workers-types'
import { type Clock, newMatchId } from '@ks/core'

import { createApplicationDatabaseClient } from './d1/client'
import type { Application } from './index'
import type { MatchRoomNamespace } from './match/match-room'
import { PlayerStorage } from './player/storage/player-storage'
import { createSparringApplication } from './sparring/sparring-application'
import { SparringMatchStorage } from './sparring/storage/sparring-match-storage'

export type ApplicationBindings = {
  DB: D1Database
  MATCH_ROOM: MatchRoomNamespace
}

export function createApplication(bindings: ApplicationBindings, clock: Clock): Application {
  const db = createApplicationDatabaseClient(bindings.DB)

  const sparring = createSparringApplication({
    clock,
    newMatchId,
    newControlSecret,
    players: new PlayerStorage(db, clock),
    matches: new SparringMatchStorage(db),
    matchRoomClient: (matchId) => bindings.MATCH_ROOM.getByName(matchId),
  })

  return { sparring }
}

function newControlSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
