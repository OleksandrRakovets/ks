import type { D1Database, ExecutionContext } from '@cloudflare/workers-types'
import { CreateMatchRequestSchema } from '@ks/competition'
import type { ControlCommand } from '@ks/core'
import { createContext, type RouterContextProvider } from 'react-router'
import invariant from 'tiny-invariant'
import type * as v from 'valibot'

export type CreateMatchRequest = v.InferInput<typeof CreateMatchRequestSchema> & { matchId: string; controlSecret: string }
type MatchRoomStub = {
  create: (
    args: CreateMatchRequest,
  ) => Promise<{ ok: true; matchId: string; controlSecret: string } | { ok: false; error: string; status: number }>
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- SAFETY: REVIEW_POST_REFACTOR
  snapshot: (args: { matchId: string }) => Promise<unknown>
  facts: (args: {
    matchId: string
    controlSecret: string
    commands: ControlCommand[]
  }) => Promise<{ ok: true; accepted: { seq: number; factId: string }[] } | { ok: false; error: string; status: number }>
  stream: (args: { matchId: string; since?: number }) => Promise<Response>
}

type RuntimeEnv = {
  DB: D1Database
  MATCH_ROOM: { getByName: (name: string) => object }
  ADMIN_USER: string
  ADMIN_PASS: string
  KS_DEPLOY_ENV?: string
}

export type AppEnv = {
  DB: D1Database
  MATCH_ROOM: { getByName: (name: string) => MatchRoomStub }
  ADMIN_USER: string
  ADMIN_PASS: string
  KS_DEPLOY_ENV?: string
}

export type CloudflareLoadContext = {
  env: RuntimeEnv
  ctx: ExecutionContext
}

export type AppLoadContext = Pick<RouterContextProvider, 'get'>

export const cloudflareContext = createContext<CloudflareLoadContext | undefined>(undefined)

export function requireEnv(context: AppLoadContext): AppEnv {
  const env = context.get(cloudflareContext)?.env
  invariant(env, 'Missing cloudflare env in route context')
  // SAFETY: The worker binds MATCH_ROOM to MatchRoom; AppEnv describes that Durable Object's public RPC methods.
  return env as AppEnv
}
