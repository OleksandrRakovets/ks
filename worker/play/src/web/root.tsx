import { resources, type SupportedLocale } from '@ks/i18n'
import i18next, { type i18n as I18nInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from 'react-router'

import { RouteError } from '@/components/route-error'
import { useFailedReadRecovery } from '@/features/freshness/use-failed-read-recovery'
import { iconBasePath, iconThemeColor, type IconVariant } from '@/features/icon-assets'
import { useRememberNavigation } from '@/features/pwa/use-remember-navigation'
import { localeFromContext } from '@/i18n'
import { type AppLoadContext, cloudflareContext } from '@/server/context.server'
import { themeFromCookie } from '@/server/theme.server'
import type { AppTheme } from '@/theme'

export type RootLoaderData = {
  iconVariant: IconVariant
  locale: SupportedLocale
  theme: AppTheme
}

export function loader({ request, context }: { request: Request; context: AppLoadContext }) {
  const cookie = request.headers.get('cookie')
  const iconVariant = context.get(cloudflareContext)?.isProduction === true ? 'green' : 'amber'
  const locale = localeFromContext(context)

  return {
    iconVariant,
    locale,
    theme: themeFromCookie(cookie),
  }
}

/**
 * SSR documents and Router `.data` responses inherit this policy, so neither reuses an HTTP snapshot
 * of scores, membership, or cookie-selected presentation. Resource routes and hashed assets set their
 * own. In-memory page restoration bypasses HTTP entirely; live pages still catch up on return.
 */
export function headers() {
  return { 'Cache-Control': 'no-store' }
}

/** Exposes the root loader's request-context locale to React components. */
export function useRootLocale(): SupportedLocale {
  const data = useRouteLoaderData<RootLoaderData>('root')

  return data?.locale ?? 'uk'
}

export function useRootTheme(): AppTheme {
  const data = useRouteLoaderData<RootLoaderData>('root')

  return data?.theme ?? 'club-dark'
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<RootLoaderData>('root')
  const locale = useRootLocale()

  const theme = data?.theme ?? 'club-dark'
  const iconVariant = data?.iconVariant ?? 'amber'
  const iconPath = iconBasePath(iconVariant)

  const htmlClass = theme === 'club-light' ? 'club-light' : theme === 'club-dark' ? 'club-dark' : ''

  return (
    <html lang={locale} className={htmlClass}>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href={`${iconPath}/favicon-32x32.png`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`${iconPath}/apple-touch-icon.png`} />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content={iconThemeColor(iconVariant)} />
        <Meta />
        <Links />
      </head>
      <body>
        <I18nextProvider i18n={i18nInstances[locale]}>{children}</I18nextProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  useRememberNavigation()

  return <Outlet />
}

export function ErrorBoundary() {
  useFailedReadRecovery()

  return <RouteError className="min-h-dvh" />
}

/** Instances are shared across requests; keep each locale's language and resources fixed. */
const i18nInstances = {
  uk: createI18nInstance('uk'),
  en: createI18nInstance('en'),
} satisfies Record<SupportedLocale, I18nInstance>

function createI18nInstance(locale: SupportedLocale): I18nInstance {
  const instance = i18next.createInstance()

  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

  return instance
}
