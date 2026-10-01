import type { RouterContextProvider } from 'react-router'

import type { IconVariant } from '../icon-assets'
import { cloudflareContext } from './context.server'

export function iconVariantFromContext(context: Pick<RouterContextProvider, 'get'>): IconVariant {
  return context.get(cloudflareContext)?.isProduction === true ? 'green' : 'amber'
}
