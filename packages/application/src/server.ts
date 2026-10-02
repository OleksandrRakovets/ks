/** Server-only application composition over D1 and the MatchRoom binding. */
import type { D1Database } from '@cloudflare/workers-types'
import { type Clock, newMatchId } from '@ks/core'
import { type Config, Effect, Layer, type Scope } from 'effect'

import { ApplicationDatabase } from './d1/client'
import type { Application } from './index'
import { ApplicationClock } from './match/clock'
import { type MatchRoomNamespace, MatchRooms } from './match/match-room'
import { PlayerStorage } from './player/storage/player-storage'
import { MatchCreation } from './sparring/create-match'
import { createSparringApplication } from './sparring/sparring-application'
import { SparringMatchStorage } from './sparring/storage/sparring-match-storage'

export type ApplicationBindings = {
  DB: D1Database
  MATCH_ROOM: MatchRoomNamespace
}

/** The caller keeps the Scope open while Router loaders/actions use the Promise-facing application. */
export const createApplication = Effect.fn('createApplication')(function* (
  bindings: ApplicationBindings,
  clock: Clock,
): Effect.fn.Return<Application, Config.ConfigError, Scope.Scope> {
  const clockLayer = Layer.succeed(ApplicationClock, clock)

  const storageLayer = Layer.merge(PlayerStorage.layer, SparringMatchStorage.layer).pipe(
    Layer.provide(ApplicationDatabase.layer(bindings.DB)),
    Layer.provide(clockLayer),
  )

  const applicationLayer = Layer.mergeAll(
    storageLayer,
    clockLayer,
    MatchRooms.layer(bindings.MATCH_ROOM),
    Layer.succeed(MatchCreation, { newMatchId, newControlSecret }),
  )

  const context = yield* Layer.build(applicationLayer)

  return { sparring: createSparringApplication(context) }
})

function newControlSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
