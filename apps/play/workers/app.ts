import { createRequestHandler, RouterContextProvider } from 'react-router'

import { cloudflareContext } from '../web/server/context'
import { MatchRoom } from './do/MatchRoom'
import type { Env } from './env'

const requestHandler = createRequestHandler(() => import('virtual:react-router/server-build'), import.meta.env.MODE)

export { MatchRoom }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const context = new RouterContextProvider()
    context.set(cloudflareContext, { env, ctx })

    return requestHandler(request, context)
  },
}
