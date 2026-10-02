import type { SparringService } from '@ks/application/server'
import type { Effect } from 'effect'
import { createContext, type RouterContextProvider } from 'react-router'

export type RunEffect = ReturnType<typeof Effect.runPromiseWith<SparringService>>

export type CloudflareLoadContext = {
  runEffect: RunEffect
  isProduction: boolean
}

export type AppLoadContext = Pick<RouterContextProvider, 'get'>

export const cloudflareContext = createContext<CloudflareLoadContext | undefined>(undefined)

export function requireRunEffect(context: AppLoadContext): RunEffect {
  const runEffect = context.get(cloudflareContext)?.runEffect

  if (!runEffect) throw new Error('Missing Effect executor in route context')

  return runEffect
}
