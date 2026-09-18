import { useLoaderData } from 'react-router'

import { MatchControlPage } from '../../features/match-control/match-control-page'
import { CombinedPyramidOldControlRenderer } from '../../features/match-control/renderers/pyramid-control-renderer'
import type { Route } from './+types/combined-pyramid-old-control'
import { commandMatchAction, loadMatchControl } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'combined-pyramid-old')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'combined-pyramid-old')
}

export default function CombinedPyramidOldControlRoute() {
  return (
    <MatchControlPage data={useLoaderData<typeof loader>()} renderer={CombinedPyramidOldControlRenderer} />
  )
}
