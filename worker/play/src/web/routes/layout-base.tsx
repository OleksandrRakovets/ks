import { Outlet } from 'react-router'

import { setLocaleFromUrl } from '@/routes/locale-middleware'

import '@/base.css'

import type { Route } from './+types/layout-base'

export const middleware: Route.MiddlewareFunction[] = [setLocaleFromUrl]

export default function LayoutBase() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col">
      <Outlet />
    </div>
  )
}
