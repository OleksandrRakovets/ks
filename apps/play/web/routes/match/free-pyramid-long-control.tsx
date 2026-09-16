import { useLoaderData } from 'react-router'

import { MatchControlPage } from '../../features/match-control/match-control-page'
import { LongFreePyramidControlRenderer } from '../../features/match-control/renderers/long-free-pyramid-control-renderer'
import type { Route } from './+types/free-pyramid-long-control'
import { commandMatchAction, loadMatchControl } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'free-pyramid-long')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'free-pyramid-long')
}

export default function FreePyramidLongControlRoute() {
  return <MatchControlPage data={useLoaderData<typeof loader>()} renderer={LongFreePyramidControlRenderer} />
}
