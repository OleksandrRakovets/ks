import { Outlet } from 'react-router'

import { AppHeader } from '../components/AppHeader'
import '../i18n'
import '../base.css'

export default function LayoutBase() {
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <div className="mx-auto flex w-full flex-1 flex-col lg:w-7xl">
        <AppHeader />
        <Outlet />
      </div>
    </div>
  )
}
