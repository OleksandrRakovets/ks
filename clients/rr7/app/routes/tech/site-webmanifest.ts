import { iconManifest, iconVariantFromContext } from '../../server/icon-assets'
import type { Route } from './+types/site-webmanifest'

export function loader({ context }: Route.LoaderArgs) {
  const variant = iconVariantFromContext(context)

  return Response.json(iconManifest(variant), {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
