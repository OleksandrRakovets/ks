import { iconResponse } from '@/server/icon-assets.server'

import type { Route } from './+types/apple-touch-icon'

export function loader({ request, context }: Pick<Route.LoaderArgs, 'request' | 'context'>) {
  return iconResponse(request, context, 'apple-touch-icon.png')
}
