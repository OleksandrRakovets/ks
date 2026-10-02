import { keys, resources, type SupportedLocale } from '@ks/i18n'
import i18next, { type i18n as I18nInstance } from 'i18next'
import { useEffect } from 'react'
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next'
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRevalidator,
  useRouteError,
  useRouteLoaderData,
} from 'react-router'

import { iconBasePath, iconThemeColor, type IconVariant } from './features/icon-assets'
import { useRememberNavigation } from './features/pwa/use-remember-navigation'
import { localeFromContext } from './i18n'
import { type AppLoadContext, cloudflareContext } from './server/context.server'
import { themeFromCookie } from './server/theme.server'
import type { AppTheme } from './theme'

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
  const error = useRouteError()
  const { t } = useTranslation()
  const { revalidate } = useRevalidator()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  useEffect(() => {
    if (notFound) return undefined
    // A loader failure unmounts the feature's live controller. The error surface must therefore
    // recover on its own. Only GET loaders are retried; no Command POST is replayed. A genuine
    // 404 is excluded because returning to the tab cannot make an unknown URL into a live page.
    let disposed = false
    let pending = false
    let catchingUp = false
    let generation = 0
    let timer: number | undefined

    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
    }

    const schedule = () => {
      clearTimer()

      if (!disposed && document.visibilityState === 'visible') timer = window.setTimeout(retry, 60_000)
    }

    const retry = () => {
      if (disposed || document.visibilityState !== 'visible' || pending) return
      clearTimer()
      pending = true
      const readGeneration = generation

      // Router owns cancellation. A return after hiding replaces its pre-hide GET; generations
      // prevent that old promise's completion from rearming this boundary's watchdog.
      const finished = () => {
        if (disposed || readGeneration !== generation) return
        pending = false
        catchingUp = false
        schedule()
      }

      void revalidate().then(finished, finished)
    }

    const hide = () => {
      generation++
      pending = false
      catchingUp = false
      clearTimer()
    }

    const catchUp = () => {
      if (disposed || document.visibilityState !== 'visible' || catchingUp) return
      catchingUp = true
      generation++
      pending = false
      retry()
    }

    const visibilityChange = () => {
      if (document.visibilityState === 'hidden') hide()
      else catchUp()
    }

    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) catchUp()
    }

    document.addEventListener('visibilitychange', visibilityChange)
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', pageShow)
    window.addEventListener('focus', catchUp)
    window.addEventListener('online', catchUp)
    schedule()

    return () => {
      disposed = true
      clearTimer()
      document.removeEventListener('visibilitychange', visibilityChange)
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', pageShow)
      window.removeEventListener('focus', catchUp)
      window.removeEventListener('online', catchUp)
    }
  }, [notFound, revalidate])

  if (notFound) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
            {t(keys.app.notFound.eyebrow)}
          </p>
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
