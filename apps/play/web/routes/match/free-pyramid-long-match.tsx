import { useLoaderData } from 'react-router'

import { MatchPage } from '../../features/match-control/match-page'
import { LongFreePyramidControlRenderer } from '../../features/match-control/renderers/long-free-pyramid-control-renderer'
import type { Route } from './+types/free-pyramid-long-match'
import { commandMatchAction, loadMatchPage } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'free-pyramid-long')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'free-pyramid-long')
}

export default function FreePyramidLongMatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={LongFreePyramidControlRenderer} />
}
