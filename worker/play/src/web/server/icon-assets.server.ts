import { iconBasePath } from '@/features/icon-assets'
import { type AppLoadContext, assetsContext, cloudflareContext } from '@/server/context.server'

/** Serves conventional icon URLs without a redirect, preserving asset validators and streaming bytes. */
export async function iconResponse(
  request: Request,
  context: AppLoadContext,
  filename: 'favicon.ico' | 'apple-touch-icon.png',
): Promise<Response> {
  const variant = context.get(cloudflareContext)?.isProduction === true ? 'green' : 'amber'
  const url = new URL(`${iconBasePath(variant)}/${filename}`, request.url)
  const asset = await context.get(assetsContext).fetch(new Request(url, request))
  const response = new Response(asset.body, asset)

  if (response.ok || response.status === 304) {
    response.headers.set('Cache-Control', 'public, max-age=604800')
  }

  return response
}
