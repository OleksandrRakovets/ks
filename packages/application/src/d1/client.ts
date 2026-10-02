import type { D1Database } from '@cloudflare/workers-types'
import { D1Client } from '@effect/sql-d1'
import { makeWithDefaults } from 'drizzle-orm/effect-d1'
import { Context, type Effect, Layer } from 'effect'

export class ApplicationDatabase extends Context.Service<
  ApplicationDatabase,
  Effect.Success<ReturnType<typeof makeWithDefaults>>
>()('@ks/application/d1/client') {
  static layer(client: D1Database) {
    return Layer.effect(this, makeWithDefaults({})).pipe(Layer.provide(D1Client.layer({ db: client })))
  }
}
