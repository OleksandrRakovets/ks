import { createApplication } from '@ks/application/server'
import { SystemClock } from '@ks/core'
import { createRequestHandler, RouterContextProvider } from 'react-router'
import * as v from 'valibot'

import {
  assetsContext,
  cloudflareContext,
  type CloudflareLoadContext,
  superadminContext,
} from '@/server/context.server'

import { handleSparringMatchLiveRequest } from './sparring-match-live'
import { checkSuperadminAccess } from './superadmin-access'

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

    const superadminAccess = await checkSuperadminAccess(request, env)

    if (superadminAccess._tag === 'denied') return superadminAccess.response

    // All remaining requests are handed to React Router.
    const context = new RouterContextProvider()

    const loadContext: CloudflareLoadContext = {
      application,
      isProduction: new URL(request.url).hostname === 'play.ks.ua',
    }

    context.set(assetsContext, env.ASSETS)
    context.set(cloudflareContext, loadContext)

    if (superadminAccess._tag === 'granted') context.set(superadminContext, true)

    return requestHandler(request, context)
  },
}
