import type { SparringService } from '@ks/application/server'
import type { Effect } from 'effect'
import { createContext, type RouterContextProvider } from 'react-router'

/** Expected failures must be adapted before crossing into Router; defects still reject the Promise. */
export type RunEffect = <A>(effect: Effect.Effect<A, never, SparringService>) => Promise<A>

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
