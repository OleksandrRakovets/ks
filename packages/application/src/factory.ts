/** Server-only application composition over D1 and the MatchRoom binding. */
import type { D1Database } from '@cloudflare/workers-types'
import { type Clock, newMatchId } from '@ks/core'

import { createApplicationDatabaseClient } from '../d1/database'
import type { Application } from './index'
import type { MatchRoomNamespace } from './match-room-client'
import { PlayerRepository } from './repositories/players'
import { SparringMatchRepository } from './repositories/sparring-matches'
import { createSparringApplicationWithDependencies } from './use-cases/sparring'

export type ApplicationBindings = {
  DB: D1Database
  MATCH_ROOM: MatchRoomNamespace
}

export function createApplication(bindings: ApplicationBindings, clock: Clock): Application {
  const db = createApplicationDatabaseClient(bindings.DB)

  const sparring = createSparringApplicationWithDependencies({
    clock,
    newMatchId,
    newControlSecret,
    players: new PlayerRepository(db, clock),
    matches: new SparringMatchRepository(db),
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
