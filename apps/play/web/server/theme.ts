export type AppTheme = 'club-dark' | 'club-light' | 'auto'

export function themeFromCookie(cookieHeader: string | null): AppTheme {
  if (!cookieHeader) return 'club-dark'

  for (const part of cookieHeader.split(';')) {
    const [rawKey, rawValue] = part.trim().split('=')

    if (rawKey === 'ks.theme') {
      if (rawValue === 'club-light' || rawValue === 'auto') return rawValue

      return 'club-dark'
    }
  }

  return 'club-dark'
}

export function themeCookieValue(theme: AppTheme): string {
  return `ks.theme=${theme}; Path=/; SameSite=Lax; Max-Age=31536000`
}
