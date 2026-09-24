import { useLoaderData } from 'react-router'

import { SparringSetupPage } from '@/features/sparring/setup/setup-page'

import type { Route } from './+types/route'
import { createSetupMatch, loadSetupPage } from './handlers'

export function loader(args: Route.LoaderArgs) {
  return loadSetupPage(args)
}

export function action(args: Route.ActionArgs) {
  return createSetupMatch(args)
}

export default function SparringSetupRoute() {
  return <SparringSetupPage {...useLoaderData<typeof loader>()} />
}
