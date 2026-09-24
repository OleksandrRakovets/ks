import { Outlet, redirect } from 'react-router'

import '@/i18n'

import '@/base.css'
import { localeContext } from '@/locale'

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
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col">
      <Outlet />
    </div>
  )
}
