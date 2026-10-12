import { pwaManifest } from '@/features/pwa/manifest'
import { type AppLoadContext, cloudflareContext } from '@/server/context.server'

export function loader({ context }: { context: AppLoadContext }) {
  const variant = context.get(cloudflareContext)?.isProduction === true ? 'green' : 'amber'

  return Response.json(pwaManifest(variant), {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
