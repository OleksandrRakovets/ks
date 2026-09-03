import { resources, type SupportedLocale } from '@ks/i18n'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

function normalizeLocale(value: string | null | undefined): SupportedLocale {
  return value === 'uk' ? 'uk' : 'en'
}

function pickLocale(): SupportedLocale {
  if (!globalThis.document) {
    return 'uk'
  }

  return normalizeLocale(globalThis.document.documentElement.lang)
}

void i18n.use(initReactI18next).init({
  resources,
  lng: pickLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export { i18n }
