import { useLoaderData } from 'react-router'

import { MatchPage } from '@/features/sparring/match/match-page'
import { FreePyramidControlRenderer } from '@/features/sparring/match/renderers/pyramid-control-renderer'
import { loadMatchPage, matchAction } from '@/routes/sparring/match/handlers'

import type { Route } from './+types/free-pyramid-match'

export const handle = { inAppBrowserIntent: 'control' } as const

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'free-pyramid')
}

export function action(args: Route.ActionArgs) {
  return matchAction(args, 'free-pyramid')
}

export default function FreePyramidMatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={FreePyramidControlRenderer} />
}
