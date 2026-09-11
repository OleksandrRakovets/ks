import type { Application } from '@ks/application'
import { createContext, type RouterContextProvider } from 'react-router'
import invariant from 'tiny-invariant'

export type CloudflareLoadContext = {
  application: Application
  deployEnvironment?: string
}

export type AppLoadContext = Pick<RouterContextProvider, 'get'>

export const cloudflareContext = createContext<CloudflareLoadContext | undefined>(undefined)

export function requireApplication(context: AppLoadContext): Application {
  const application = context.get(cloudflareContext)?.application
  invariant(application, 'Missing application in route context')

  return application
}
