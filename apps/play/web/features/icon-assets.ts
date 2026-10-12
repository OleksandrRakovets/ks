export type IconVariant = 'green' | 'amber'

export function iconBasePath(variant: IconVariant): string {
  return `/icons/${variant}`
}

export function iconThemeColor(variant: IconVariant): string {
  return variant === 'green' ? '#1f9e6e' : '#d4950a'
}
