import { createRequestHandler } from 'react-router'

import { MatchRoom } from './do/MatchRoom'
import type { Env } from './env'

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: {
      env: Env
      ctx: ExecutionContextLike
    }
  }
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build').then((mod) => mod.default),
  process.env.NODE_ENV,
)

export { MatchRoom }

type ExecutionContextLike = {
  waitUntil?: (promise: Promise<unknown>) => void
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    })
  },
}
