import { iconResponse } from '@/server/icon-assets.server'

import type { Route } from './+types/favicon'

export function loader({ request, context }: Pick<Route.LoaderArgs, 'request' | 'context'>) {
  return iconResponse(request, context, 'favicon.ico')
}
