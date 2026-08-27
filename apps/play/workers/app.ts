import { createApplication } from '@ks/application'
import { createRequestHandler, RouterContextProvider } from 'react-router'

import { cloudflareContext, type CloudflareLoadContext } from '../web/server/context'
import type { Env } from './env'

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
)

export default {
  async fetch(request: Request, env: Env) {
    const context = new RouterContextProvider()
    const loadContext: CloudflareLoadContext = { application: createApplication(env) }
    if (env.KS_DEPLOY_ENV !== undefined) loadContext.deployEnvironment = env.KS_DEPLOY_ENV
    context.set(cloudflareContext, loadContext)

    return requestHandler(request, context)
  },
}
