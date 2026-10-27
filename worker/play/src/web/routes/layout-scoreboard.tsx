import { Outlet } from 'react-router'

import { setLocaleFromUrl } from '@/routes/locale-middleware'

import type { Route } from './+types/layout-scoreboard'

/**
 * Parent of the stream scoreboard pages. Unlike `layout-base`, it imports no app stylesheet, so
 * the app's themes, Tailwind base, and colour scheme never reach the stream document.
 */
export const middleware: Route.MiddlewareFunction[] = [setLocaleFromUrl]

export default function LayoutScoreboard() {
  return <Outlet />
}
