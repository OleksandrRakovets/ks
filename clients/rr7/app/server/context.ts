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
      init: (args: unknown) => Promise<{ ok: true; alreadyInitialized?: true } | { ok: false; error: string; status: number }>
      snapshot: (args: unknown) => Promise<unknown>
      events: (
        args: unknown,
      ) => Promise<{ ok: true; accepted: { seq: number; eventId: string }[] } | { ok: false; error: string; status: number }>
      stream: (args: unknown) => Promise<Response>
    }
  }
  ADMIN_USER: string
  ADMIN_PASS: string
}

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
