import { Outlet } from 'react-router'

import '../i18n'
import '../base.css'

export default function LayoutBase() {
  return (
    <div className="mx-auto flex min-h-screen w-7xl">
      <Outlet />
    </div>
  )
}
