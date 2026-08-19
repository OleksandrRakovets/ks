import { Outlet } from 'react-router'
import { useLocation } from 'react-router'

import '../i18n'

import '../base.css'
import { AppHeader } from '../components/AppHeader'

export default function LayoutBase() {
  const location = useLocation()
  const showHeader = location.pathname !== '/'
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <div className="flex w-full flex-1 flex-col lg:mx-auto lg:w-4xl">
        {showHeader && <AppHeader />}
        <Outlet />
      </div>
    </div>
  )
}
