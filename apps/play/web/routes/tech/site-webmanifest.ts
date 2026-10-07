import { iconManifest } from '@/features/icon-assets'
import { type AppLoadContext, cloudflareContext } from '@/server/context.server'

export function loader({ context }: { context: AppLoadContext }) {
  const variant = context.get(cloudflareContext)?.isProduction === true ? 'green' : 'amber'

  return Response.json(iconManifest(variant), {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
