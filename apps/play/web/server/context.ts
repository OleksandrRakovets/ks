import { createContext, type RouterContextProvider } from 'react-router'
import invariant from 'tiny-invariant'

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
    getByName: (name: string) => {
      create: (
        args: unknown,
      ) => Promise<{ ok: true; matchId: string; controlSecret: string } | { ok: false; error: string; status: number }>
      init: (args: unknown) => Promise<{ ok: true; alreadyInitialized?: true } | { ok: false; error: string; status: number }>
      snapshot: (args: unknown) => Promise<unknown>
      facts: (
        args: unknown,
      ) => Promise<{ ok: true; accepted: { seq: number; factId: string }[] } | { ok: false; error: string; status: number }>
      stream: (args: unknown) => Promise<Response>
    }
  }
  ADMIN_USER: string
  ADMIN_PASS: string
  KS_DEPLOY_ENV?: string
}

export type CloudflareLoadContext = {
  env: unknown
  ctx: unknown
}

export type AppLoadContext = Pick<RouterContextProvider, 'get'>

export const cloudflareContext = createContext<CloudflareLoadContext | undefined>(undefined)

export function requireEnv(context: AppLoadContext): AppEnv {
  const env = context.get(cloudflareContext)?.env as AppEnv | undefined
  invariant(env, 'Missing cloudflare env in route context')
  return env
}
