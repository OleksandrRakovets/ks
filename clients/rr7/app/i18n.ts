import { resources, type SupportedLocale } from '@ks/i18n'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const LOCALE_COOKIE_NAME = 'ks.locale'

function normalizeLocale(value: string | null | undefined): SupportedLocale {
  return value === 'en' ? 'en' : 'uk'
}

function persistLocaleCookie(locale: SupportedLocale) {
  if (typeof document !== 'undefined') {
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`
  }
}

function pickLocale(): SupportedLocale {
  if (typeof document === 'undefined') {
    return 'uk'
  }

  const fromHtml = normalizeLocale(document.documentElement.lang)
  persistLocaleCookie(fromHtml)
  return fromHtml
}

function syncDocumentLang(locale: SupportedLocale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: pickLocale(),
  fallbackLng: 'uk',
  interpolation: { escapeValue: false },
})

syncDocumentLang(normalizeLocale(i18n.resolvedLanguage))
i18n.on('languageChanged', (value) => {
  const locale = normalizeLocale(value)
  syncDocumentLang(locale)
  persistLocaleCookie(locale)
})

export { i18n }
