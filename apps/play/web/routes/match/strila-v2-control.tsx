import { useLoaderData } from 'react-router'

import { MatchControlPage } from '../../features/match-control/match-control-page'
import { StrilaControlRenderer } from '../../features/match-control/renderers/strila-control-renderer'
import type { Route } from './+types/strila-v2-control'
import { commandMatchAction, loadMatchControl } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'strila-v2')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'strila-v2')
}

export default function StrilaV2ControlRoute() {
  return <MatchControlPage data={useLoaderData<typeof loader>()} renderer={StrilaControlRenderer} />
}
