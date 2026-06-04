import type { SupportedLocale } from '@ks/i18n'

const LOCALE_COOKIE_NAME = 'ks.locale'
const DEFAULT_LOCALE: SupportedLocale = 'en'

function rawLocaleFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [rawKey, rawValue] = part.trim().split('=')
    if (rawKey === LOCALE_COOKIE_NAME) {
      return rawValue ?? null
    }
  }
  return null
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  return value === 'uk' ? 'uk' : DEFAULT_LOCALE
}

export function localeFromCookie(cookieHeader: string | null): SupportedLocale {
  return normalizeLocale(rawLocaleFromCookie(cookieHeader))
}

export function hasValidLocaleCookie(cookieHeader: string | null): boolean {
  const rawLocale = rawLocaleFromCookie(cookieHeader)
  return rawLocale === 'en' || rawLocale === 'uk'
}

export function localeCookieValue(locale: SupportedLocale): string {
  return `${LOCALE_COOKIE_NAME}=${locale}; Path=/; SameSite=Lax; Max-Age=31536000`
}
