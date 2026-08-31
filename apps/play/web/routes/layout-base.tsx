import { Outlet, type UIMatch, useLocation, useMatches } from 'react-router'

import '../i18n'

import '../base.css'
import { AppHeader } from '../components/AppHeader'

type LayoutHandle = { headerless?: boolean }

export default function LayoutBase() {
  const location = useLocation()
  const matches = useMatches()
  // SAFETY: Route handles in this app expose only optional static layout metadata.
  const headerless = matches.some((match: UIMatch) => (match.handle as LayoutHandle | undefined)?.headerless)
  const showHeader = location.pathname !== '/' && !headerless
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <div className="flex w-full flex-1 flex-col lg:mx-auto lg:w-4xl">
        {showHeader && <AppHeader />}
        <Outlet />
      </div>
    </div>
  )
}
