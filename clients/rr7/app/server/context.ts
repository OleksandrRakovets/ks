export type AppEnv = {
  DB: {
    prepare: (sql: string) => {
      bind: (...args: unknown[]) => {
        run: () => Promise<unknown>
        first: <T>() => Promise<T | null>
        all: <T>() => Promise<{ results?: T[] }>
      }
    }
  }
  MATCH_ROOM: {
    idFromName: (name: string) => unknown
    get: (id: unknown) => {
      fetch: (request: Request | string, init?: RequestInit) => Promise<Response>
    }
  }
  ADMIN_USER: string
  ADMIN_PASS: string
}

import invariant from 'tiny-invariant'

export type AppLoadContext = {
  cloudflare?: {
    env: AppEnv
    ctx: unknown
  }
}

export function requireEnv(context: AppLoadContext): AppEnv {
  const env = context.cloudflare?.env
  invariant(env, 'Missing cloudflare env in route context')
  return env
}
