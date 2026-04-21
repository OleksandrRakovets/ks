import { Outlet } from 'react-router'

import { AppHeader } from '../components/AppHeader'
import '../i18n'
import '../base.css'

export default function LayoutBase() {
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full flex-1 flex-col lg:w-7xl">
        <Outlet />
      </div>
    </div>
  )
}
