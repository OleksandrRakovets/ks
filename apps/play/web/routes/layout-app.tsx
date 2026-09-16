import { Outlet } from 'react-router'

import { AppShell } from '../components/AppShell'

export default function AppLayout() {
  return (
    <>
      <AppShell />
      <Outlet />
    </>
  )
}
