import { Outlet, redirect, useLocation, useMatches } from 'react-router'

import { cn } from '@/components/ui/utils'
import { InAppBrowserNotice } from '@/features/in-app-browser/notice'
import { useInAppBrowser } from '@/features/in-app-browser/use-in-app-browser'
import { localeContext } from '@/i18n'

import '@/base.css'

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
  const browser = useInAppBrowser()
  const hasDetectedInAppBrowser = browser !== null
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

  return (
    <div className="mx-auto w-full max-w-app">
      {hasDetectedInAppBrowser ? (
        <InAppBrowserNotice
          key={`${location.pathname}${location.search}${location.hash}`}
          browser={browser}
          fullHeight={fullHeight}
        />
      ) : null}
      <div
        className={cn(
          'flex min-h-dvh w-full flex-col',
          // Scope fixed page controls below the notice instead of over its viewport.
          hasDetectedInAppBrowser && '[contain:layout]',
        )}
      >
        <Outlet />
      </div>
    </div>
  )
}
