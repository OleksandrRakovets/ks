import { useLoaderData } from 'react-router'

import { SparringSetupPage } from '@/features/sparring/setup/setup-page'
import { createSetupMatch, loadSetupPage } from '@/routes/sparring/setup/handlers'

import type { Route } from './+types/route'

export const handle = { inAppBrowserIntent: 'form' } as const

export function loader(args: Route.LoaderArgs) {
  return loadSetupPage(args)
}

export function action(args: Route.ActionArgs) {
  return createSetupMatch(args)
}

export default function SparringSetupRoute() {
  return <SparringSetupPage {...useLoaderData<typeof loader>()} />
}
