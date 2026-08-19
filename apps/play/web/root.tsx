import type { SupportedLocale } from '@ks/i18n'
import { keys } from '@ks/i18n'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  data,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
} from 'react-router'

import type { Route } from './+types/root'
import { i18n } from './i18n'
import { iconBasePath, iconThemeColor, iconVariantFromContext } from './server/icon-assets'
import { hasValidLocaleCookie, localeCookieValue, localeFromCookie } from './server/locale'
import { themeFromCookie, type AppTheme } from './server/theme'

export type RootLoaderData = {
  iconVariant: ReturnType<typeof iconVariantFromContext>
  locale: SupportedLocale
  theme: AppTheme
}

export function loader({ request, context }: Route.LoaderArgs) {
  const cookie = request.headers.get('cookie')
  const iconVariant = iconVariantFromContext(context)
  const locale = localeFromCookie(cookie)

  const payload: RootLoaderData = {
    iconVariant,
    locale,
    theme: themeFromCookie(cookie),
  }

  if (!hasValidLocaleCookie(cookie)) {
    return data(payload, { headers: { 'Set-Cookie': localeCookieValue(locale) } })
  }

  return payload
}

export function useRootLocale(): SupportedLocale {
  const data = useRouteLoaderData<RootLoaderData>('root')
  return data?.locale ?? 'en'
}

export function useRootTheme(): AppTheme {
  const data = useRouteLoaderData<RootLoaderData>('root')
  return data?.theme ?? 'club-dark'
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<RootLoaderData>('root')
  const locale = data?.locale ?? 'en'
  const theme = data?.theme ?? 'club-dark'
  const iconVariant = data?.iconVariant ?? 'amber'
  const iconPath = iconBasePath(iconVariant)

  if (!globalThis.document && i18n.resolvedLanguage !== locale) {
    void i18n.changeLanguage(locale)
  }

  useEffect(() => {
    if (i18n.resolvedLanguage !== locale) {
      void i18n.changeLanguage(locale)
    }
  }, [locale])

  const htmlClass = theme === 'club-light' ? 'club-light' : theme === 'club-dark' ? 'club-dark' : ''

  return (
    <html lang={locale} className={htmlClass}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href={`${iconPath}/favicon-32x32.png`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`${iconPath}/apple-touch-icon.png`} />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content={iconThemeColor(iconVariant)} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary() {
  const error = useRouteError()
  const { t } = useTranslation()

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">{t(keys.app.notFound.eyebrow)}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(keys.app.notFound.title)}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t(keys.app.notFound.description)}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">{t(keys.app.error.eyebrow)}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(keys.app.error.title)}</h1>
      </div>
    </main>
  )
}
