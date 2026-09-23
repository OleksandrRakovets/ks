import { useLoaderData } from 'react-router'

import { MatchPage } from '../../features/match-control/match-page'
import { StrilaControlRenderer } from '../../features/match-control/renderers/strila-control-renderer'
import type { Route } from './+types/strila-v2-match'
import { commandMatchAction, loadMatchPage } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'strila-v2')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'strila-v2')
}

export default function StrilaV2MatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={StrilaControlRenderer} />
}
