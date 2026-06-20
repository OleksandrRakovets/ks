import { createRequestHandler, RouterContextProvider } from 'react-router'
import type { ServerBuild } from 'react-router'

import { cloudflareContext } from '../web/server/context'
import { MatchRoom } from './do/MatchRoom'
import type { Env } from './env'

const requestHandler = createRequestHandler(
  () =>
    import('virtual:react-router/server-build').then(
      (mod) => (mod as { default?: ServerBuild }).default ?? (mod as unknown as ServerBuild),
    ),
  process.env.NODE_ENV,
)

export { MatchRoom }

type ExecutionContextLike = {
  waitUntil?: (promise: Promise<unknown>) => void
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike) {
    const context = new RouterContextProvider()
    context.set(cloudflareContext, { env, ctx })

    return requestHandler(request, context)
  },
}
