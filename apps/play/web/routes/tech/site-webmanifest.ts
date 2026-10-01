import { iconManifest } from '@/icon-assets'
import { iconVariantFromContext } from '@/server/icon-assets.server'

import type { Route } from './+types/site-webmanifest'

export function loader({ context }: Route.LoaderArgs) {
  const variant = iconVariantFromContext(context)

  return Response.json(iconManifest(variant), {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
