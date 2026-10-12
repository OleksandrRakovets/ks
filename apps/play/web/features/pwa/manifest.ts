import { iconBasePath, iconThemeColor, type IconVariant } from '@/features/icon-assets'

export function pwaManifest(variant: IconVariant) {
  const basePath = iconBasePath(variant)

  return {
    name: 'Play & Keep Score',
    short_name: 'Play! KS',
    // Preserve the identity originally inferred from start_url: '/'.
    id: '/',
    start_url: '/start/',
    scope: '/',
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
