import { applicationLayer } from '@ks/application/server'
import { SystemClock } from '@ks/core'
import { Effect, Layer } from 'effect'
import { createRequestHandler, RouterContextProvider } from 'react-router'
import * as v from 'valibot'

import { cloudflareContext, type CloudflareLoadContext } from '../web/server/context.server'
import { handleSparringMatchLiveRequest } from './sparring-match-live'

export { MatchRoom } from '@ks/match-room'

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
)

// Cloudflare omits request.cf in Dashboard and Playground previews, but provides timezone on production requests.
const RequestTimeZone = v.optional(v.string())

export default {
  fetch(request: Request, env: Cloudflare.Env) {
    return Effect.runPromise(
      Effect.gen(function* () {
        const requestTimeZone = v.parse(RequestTimeZone, request.cf?.timezone)
        const services = yield* Layer.build(applicationLayer(env, new SystemClock(requestTimeZone)))
        const runEffect = Effect.runPromiseWith(services)

        // Sparring Match WebSocket URLs are forwarded directly to the owning MatchRoom Durable Object.
        const liveResponse = yield* Effect.promise(() =>
          handleSparringMatchLiveRequest(request, env, runEffect),
        )

        if (liveResponse) return liveResponse

        // All remaining requests are handed to React Router.
        const context = new RouterContextProvider()

        const loadContext: CloudflareLoadContext = {
          runEffect,
          isProduction: new URL(request.url).hostname === 'play.ks.ua',
        }

        context.set(cloudflareContext, loadContext)

        return yield* Effect.promise(() => requestHandler(request, context))
      }).pipe(Effect.scoped),
    )
  },
}
