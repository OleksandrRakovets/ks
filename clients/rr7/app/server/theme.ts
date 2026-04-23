export type AppTheme = 'dark' | 'light' | 'auto'

export function themeFromCookie(cookieHeader: string | null): AppTheme {
  if (!cookieHeader) return 'dark'
  for (const part of cookieHeader.split(';')) {
    const [rawKey, rawValue] = part.trim().split('=')
    if (rawKey === 'ks.theme') {
      if (rawValue === 'light' || rawValue === 'auto') return rawValue
      return 'dark'
    }
  }
  return 'dark'
}

export function themeCookieValue(theme: AppTheme): string {
  return `ks.theme=${theme}; Path=/; SameSite=Lax; Max-Age=31536000`
}
