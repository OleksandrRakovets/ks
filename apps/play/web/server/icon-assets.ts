import type { RouterContextProvider } from 'react-router'

import { cloudflareContext } from './context'

export type IconVariant = 'green' | 'amber'

type IconEnv = {
  KS_DEPLOY_ENV?: string
}

function iconVariantFromEnv(env: IconEnv | undefined): IconVariant {
  return env?.KS_DEPLOY_ENV === 'production' ? 'green' : 'amber'
}

export function iconVariantFromContext(context: Pick<RouterContextProvider, 'get'>): IconVariant {
  return iconVariantFromEnv({ KS_DEPLOY_ENV: context.get(cloudflareContext)?.deployEnvironment })
}

export function iconBasePath(variant: IconVariant): string {
  return `/icons/${variant}`
}

export function iconThemeColor(variant: IconVariant): string {
  return variant === 'green' ? '#1f9e6e' : '#d4950a'
}

export function iconManifest(variant: IconVariant) {
  const basePath = iconBasePath(variant)

  return {
    name: 'Play & Keep Score',
    short_name: 'Play! KS',
    start_url: '/',
    display: 'standalone',
    background_color: '#111c14',
    theme_color: iconThemeColor(variant),
    icons: [
      {
        src: `${basePath}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }
}
