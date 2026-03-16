import type { SupportedLocale } from '@ks/i18n'
import type { LoaderFunctionArgs } from 'react-router'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useRouteLoaderData } from 'react-router'
import invariant from 'tiny-invariant'

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

export function loader({ request }: LoaderFunctionArgs) {
  return { locale: localeFromCookie(request.headers.get('cookie')) }
}

export type RootLoaderData = ReturnType<typeof loader>

export function useRootLocale(): SupportedLocale {
  const data = useRouteLoaderData<RootLoaderData>('root')
  invariant(data, 'Missing root loader data')
  return data.locale
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { locale } = useLoaderData<typeof loader>()

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
