import { useLoaderData } from 'react-router'

import { MatchControlPage } from '../../features/match-control/match-control-page'
import { CombinedPyramidControlRenderer } from '../../features/match-control/renderers/pyramid-control-renderer'
import type { Route } from './+types/combined-pyramid-control'
import { commandMatchAction, loadMatchControl } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'combined-pyramid')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'combined-pyramid')
}

export default function CombinedPyramidControlRoute() {
  return <MatchControlPage data={useLoaderData<typeof loader>()} renderer={CombinedPyramidControlRenderer} />
}
