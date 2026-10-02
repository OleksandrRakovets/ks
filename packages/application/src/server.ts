/** Server-only application composition over D1 and the MatchRoom binding. */
import type { D1Database } from '@cloudflare/workers-types'
import { type Clock, newMatchId } from '@ks/core'
import { Layer } from 'effect'

import { ApplicationDatabase } from './d1/client'
import { ApplicationClock } from './match/clock'
import { type MatchRoomNamespace, MatchRooms } from './match/match-room'
import { PlayerStorage } from './player/storage/player-storage'
import { MatchCreation } from './sparring/create-match'
import { SparringService } from './sparring/sparring-service'
import { SparringMatchStorage } from './sparring/storage/sparring-match-storage'

export { SparringService } from './sparring/sparring-service'

export type ApplicationBindings = {
  DB: D1Database
  MATCH_ROOM: MatchRoomNamespace
}

/** Exposes public capabilities only. The caller owns the build Scope and keeps it open through request handling. */
export function applicationLayer(bindings: ApplicationBindings, clock: Clock) {
  const clockLayer = Layer.succeed(ApplicationClock, clock)

  const storageLayer = Layer.merge(PlayerStorage.layer, SparringMatchStorage.layer).pipe(
    Layer.provide(ApplicationDatabase.layer(bindings.DB)),
    Layer.provide(clockLayer),
  )

  const dependencies = Layer.mergeAll(
    storageLayer,
    clockLayer,
    MatchRooms.layer(bindings.MATCH_ROOM),
    Layer.succeed(MatchCreation, { newMatchId, newControlSecret }),
  )

  return SparringService.layer.pipe(Layer.provide(dependencies))
}

function newControlSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
