import { useEffect } from 'react'
import { Outlet, redirect, useLocation, useMatches } from 'react-router'

import { markInAppBrowser } from '@/features/in-app-browser/detection'
import { InAppBrowserNotice } from '@/features/in-app-browser/notice'
import { localeContext } from '@/i18n'

import type { Route } from './+types/layout-base'

export const middleware: Route.MiddlewareFunction[] = [
  ({ request, context }) => {
    const url = new URL(request.url)

    if (url.pathname === '/en') {
      throw redirect(`/en/${url.search}`, 308)
    }

    context.set(localeContext, url.pathname.startsWith('/en/') ? 'en' : 'uk')
  },
]

export default function LayoutBase() {
  const location = useLocation()
  const matches = useMatches()

  const fullHeight = matches.some((match) => {
    // SAFETY: Page routes own this optional handle; other route handles have no browser intent.
    const handle = match.handle as { inAppBrowserIntent?: 'form' | 'control' } | undefined
    // SAFETY: Routes with control intent return MatchPageData with this page discriminant.
    const data = match.loaderData as { page?: 'control' | 'result' } | undefined

    return (
      handle?.inAppBrowserIntent === 'form' ||
      (handle?.inAppBrowserIntent === 'control' && data?.page === 'control')
    )
  })

  useEffect(markInAppBrowser, [])

  return (
    <div className="mx-auto w-full max-w-app">
      <InAppBrowserNotice
        key={`${location.pathname}${location.search}${location.hash}`}
        fullHeight={fullHeight}
      />
      {/* Scope fixed page controls below a visible notice instead of over its viewport. */}
      <div className="flex min-h-dvh w-full flex-col [html[data-in-app-browser]_&]:[contain:layout]">
        <Outlet />
      </div>
    </div>
  )
}
