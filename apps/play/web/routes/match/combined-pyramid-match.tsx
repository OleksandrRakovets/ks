import { useLoaderData } from 'react-router'

import { MatchPage } from '../../features/match-control/match-page'
import { CombinedPyramidControlRenderer } from '../../features/match-control/renderers/pyramid-control-renderer'
import type { Route } from './+types/combined-pyramid-match'
import { commandMatchAction, loadMatchPage } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'combined-pyramid')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'combined-pyramid')
}

export default function CombinedPyramidMatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={CombinedPyramidControlRenderer} />
}
