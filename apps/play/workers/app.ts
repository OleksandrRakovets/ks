import { createApplication } from '@ks/application'
import { createRequestHandler, RouterContextProvider } from 'react-router'

import { cloudflareContext, type CloudflareLoadContext } from '../web/server/context'
import type { Env } from './env'
import { handleSparringMatchLiveRequest } from './sparring-match-live'

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
)

export default {
  async fetch(request: Request, env: Env) {
    const application = createApplication(env)
    // Sparring Match WebSocket URLs are forwarded directly to the owning MatchRoom Durable Object.
    const liveResponse = await handleSparringMatchLiveRequest(request, env, application)
    if (liveResponse) return liveResponse

    // All remaining requests are handed to React Router.
    const context = new RouterContextProvider()
    const loadContext: CloudflareLoadContext = { application }
    if (env.KS_DEPLOY_ENV !== undefined) loadContext.deployEnvironment = env.KS_DEPLOY_ENV
    context.set(cloudflareContext, loadContext)

    return requestHandler(request, context)
  },
}
