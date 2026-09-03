import { Outlet, redirect } from 'react-router'

import '../i18n'

import '../base.css'
import { localeContext } from '../locale'
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
    <div className="flex min-h-dvh w-full flex-col">
      <div className="flex w-full flex-1 flex-col lg:mx-auto lg:w-4xl">
        <Outlet />
      </div>
    </div>
  )
}
