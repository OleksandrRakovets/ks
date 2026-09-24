import { useLoaderData } from 'react-router'

import { MatchPage } from '@/features/sparring/match/match-page'
import { FreePyramidControlRenderer } from '@/features/sparring/match/renderers/pyramid-control-renderer'

import type { Route } from './+types/free-pyramid-match'
import { commandMatchAction, loadMatchPage } from './handlers'

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'free-pyramid')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'free-pyramid')
}

export default function FreePyramidMatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={FreePyramidControlRenderer} />
}
