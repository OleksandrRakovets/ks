import { createRequestHandler } from 'react-router'

import workerApiApp, { MatchRoom } from '../../../services/worker/src/index'
import type { Env } from '../../../services/worker/src/env'

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: {
      env: Env
      ctx: ExecutionContextLike
    }
  }
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build') as unknown as import('react-router').ServerBuild,
  process.env.NODE_ENV,
)

export { MatchRoom }

type ExecutionContextLike = {
  waitUntil?: (promise: Promise<unknown>) => void
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike) {
    const url = new URL(request.url)
    if (url.pathname === '/healthz' || url.pathname.startsWith('/api/')) {
      return workerApiApp.fetch(request, env, ctx as never)
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    })
  },
}
