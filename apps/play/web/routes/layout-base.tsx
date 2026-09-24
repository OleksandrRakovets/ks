import { Outlet, redirect } from 'react-router'

import { localeContext, localeFromPathname } from '@/i18n'

import '@/base.css'

import type { Route } from './+types/layout-base'

export const middleware: Route.MiddlewareFunction[] = [
  ({ request, context }) => {
    const url = new URL(request.url)

    if (url.pathname === '/en') {
      throw redirect(`/en/${url.search}`, 308)
    }

    context.set(localeContext, localeFromPathname(url.pathname))
  },
]

export default function LayoutBase() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col">
      <Outlet />
    </div>
  )
}
