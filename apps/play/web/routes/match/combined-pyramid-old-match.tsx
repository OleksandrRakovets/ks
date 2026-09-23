import { useLoaderData } from 'react-router'

import { MatchPage } from '../../features/match-control/match-page'
import { CombinedPyramidOldControlRenderer } from '../../features/match-control/renderers/pyramid-control-renderer'
import type { Route } from './+types/combined-pyramid-old-match'
import { commandMatchAction, loadMatchPage } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'combined-pyramid-old')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'combined-pyramid-old')
}

export default function CombinedPyramidOldMatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={CombinedPyramidOldControlRenderer} />
}
