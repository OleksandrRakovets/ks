import { Outlet } from 'react-router'

import '../i18n'

import '../base.css'

export default function LayoutBase() {
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <div className="flex w-full flex-1 flex-col lg:mx-auto lg:w-4xl">
        <Outlet />
      </div>
    </div>
  )
}
