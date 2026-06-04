import type { SupportedLocale } from '@ks/i18n'

export function localeFromCookie(cookieHeader: string | null): SupportedLocale {
  if (!cookieHeader) return 'en'
  for (const part of cookieHeader.split(';')) {
    const [rawKey, rawValue] = part.trim().split('=')
    if (rawKey === 'ks.locale') {
      return rawValue === 'uk' ? 'uk' : 'en'
    }
  }
  return 'en'
}
