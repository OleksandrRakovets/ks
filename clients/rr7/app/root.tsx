import type { SupportedLocale } from '@ks/i18n'
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
} from 'react-router'
import invariant from 'tiny-invariant'

import type { Route } from './+types/root'

const LOCALE_COOKIE_NAME = 'ks.locale'

function normalizeLocale(value: string | null | undefined): SupportedLocale {
  return value === 'en' ? 'en' : 'uk'
}

function localeFromCookie(cookieHeader: string | null): SupportedLocale {
  if (!cookieHeader) return 'uk'
  for (const part of cookieHeader.split(';')) {
    const [rawKey, rawValue] = part.trim().split('=')
    if (rawKey === LOCALE_COOKIE_NAME) {
      return normalizeLocale(rawValue)
    }
  }
  return 'uk'
}

export function loader({ request }: Route.LoaderArgs) {
  return { locale: localeFromCookie(request.headers.get('cookie')) }
}

export type RootLoaderData = ReturnType<typeof loader>

export function useRootLocale(): SupportedLocale {
  const data = useRouteLoaderData<RootLoaderData>('root')
  invariant(data, 'Missing root loader data')
  return data.locale
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<RootLoaderData>('root')
  const locale = data?.locale ?? 'uk'

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="latte">
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

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">404</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This page is unavailable or the match no longer exists in local storage.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Error</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Something went wrong</h1>
      </div>
    </main>
  )
}
