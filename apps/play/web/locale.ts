import type { SupportedLocale } from '@ks/i18n'
import { createContext, type RouterContextProvider } from 'react-router'

export const localeContext = createContext<SupportedLocale>('uk')

export function localeFromContext(context: Pick<RouterContextProvider, 'get'>): SupportedLocale {
  return context.get(localeContext)
}

export function localizedPath(path: string, locale: SupportedLocale): string {
  return locale === 'en' ? `/en${path}` : path
}

export function pathForLocale(
  pathname: string,
  search: string,
  hash: string,
  locale: SupportedLocale,
): string {
  const pathWithoutLocale = pathname === '/en/' ? '/' : pathname.replace(/^\/en(?=\/)/, '')
  return `${localizedPath(pathWithoutLocale, locale)}${search}${hash}`
}
