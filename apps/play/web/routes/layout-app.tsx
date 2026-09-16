import { Outlet, useLoaderData } from 'react-router'

import { AppShell } from '../components/AppShell'
import type { AppLoadContext } from '../server/context'
import { requireApplication } from '../server/context'

export async function loader({ context }: { context: AppLoadContext }) {
  const application = requireApplication(context)

  return { matchCount: await application.countMatches() }
}

export default function AppLayout() {
  const { matchCount } = useLoaderData<typeof loader>()

  return (
    <>
      <AppShell matchCount={matchCount} />
      <Outlet />
    </>
  )
}
