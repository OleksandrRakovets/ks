import type { Application } from '@ks/application'
import { createContext, type RouterContextProvider } from 'react-router'

export type CloudflareLoadContext = {
  application: Application
  isProduction: boolean
}

export type AppLoadContext = Pick<RouterContextProvider, 'get'>

export const cloudflareContext = createContext<CloudflareLoadContext | undefined>(undefined)

export const assetsContext = createContext<Pick<Fetcher, 'fetch'>>()

export function requireApplication(context: AppLoadContext): Application {
  const application = context.get(cloudflareContext)?.application

  if (!application) throw new Error('Missing application in route context')

  return application
}

/** Who passed the Worker's superadmin gate. */
export type Superadmin = { readonly email: string }

/** Set by the Worker only after it verified a superadmin request; every superadmin loader must require it. */
export const superadminContext = createContext<Superadmin | null>(null)
