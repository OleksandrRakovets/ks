import { createApplication } from '@ks/application/server'
import { SystemClock } from '@ks/core'
import { createRequestHandler, RouterContextProvider } from 'react-router'
import * as v from 'valibot'

import { cloudflareContext, type CloudflareLoadContext } from '../web/.server/context'
import { handleSparringMatchLiveRequest } from './sparring-match-live'

export { MatchRoom } from '@ks/match-room'

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
)

// Cloudflare omits request.cf in Dashboard and Playground previews, but provides timezone on production requests.
const RequestTimeZone = v.optional(v.string())

export default {
  async fetch(request: Request, env: Cloudflare.Env) {
    const requestTimeZone = v.parse(RequestTimeZone, request.cf?.timezone)
    const application = createApplication(env, new SystemClock(requestTimeZone))
    // Sparring Match WebSocket URLs are forwarded directly to the owning MatchRoom Durable Object.
    const liveResponse = await handleSparringMatchLiveRequest(request, env, application)

    if (liveResponse) return liveResponse

    // All remaining requests are handed to React Router.
    const context = new RouterContextProvider()

    const loadContext: CloudflareLoadContext = {
      application,
      isProduction: new URL(request.url).hostname === 'play.ks.ua',
    }

    context.set(cloudflareContext, loadContext)

    return requestHandler(request, context)
  },
}
