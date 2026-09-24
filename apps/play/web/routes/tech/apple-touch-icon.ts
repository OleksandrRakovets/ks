import { iconBasePath, iconVariantFromContext } from '@/server/icon-assets'

import type { Route } from './+types/apple-touch-icon'

export function loader({ context }: Route.LoaderArgs) {
  const variant = iconVariantFromContext(context)

  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store',
      Location: `${iconBasePath(variant)}/apple-touch-icon.png`,
    },
  })
}
