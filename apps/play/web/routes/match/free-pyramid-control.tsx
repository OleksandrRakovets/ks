import { useLoaderData } from 'react-router'

import { MatchControlPage } from '../../features/match-control/match-control-page'
import { FreePyramidControlRenderer } from '../../features/match-control/renderers/pyramid-control-renderer'
import type { Route } from './+types/free-pyramid-control'
import { commandMatchAction, loadMatchControl } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'free-pyramid')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'free-pyramid')
}

export default function FreePyramidControlRoute() {
  return <MatchControlPage data={useLoaderData<typeof loader>()} renderer={FreePyramidControlRenderer} />
}
