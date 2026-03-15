import { resources, type SupportedLocale } from '@ks/i18n'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

function pickLocale(): SupportedLocale {
  if (typeof localStorage === 'undefined') {
    return 'uk'
  }
  const override = localStorage.getItem('ks.locale')
  return override === 'en' ? 'en' : 'uk'
}

void i18n.use(initReactI18next).init({
  resources,
  lng: pickLocale(),
  fallbackLng: 'uk',
  showSupportNotice: !import.meta.env.DEV,
  interpolation: { escapeValue: false },
})

export { i18n }
