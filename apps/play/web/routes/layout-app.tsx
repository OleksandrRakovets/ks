import { Outlet, useLoaderData } from 'react-router'

import { AppShell } from '../components/AppShell'
import { localeFromContext } from '../locale'
import type { AppLoadContext } from '../server/context'
import { requireApplication } from '../server/context'

export async function loader({ context }: { context: AppLoadContext }) {
  const application = requireApplication(context)
  const matches = await application.listMatches(localeFromContext(context))

  return { matchCount: matches.length }
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
