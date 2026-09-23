import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '../../features/match-protocol/match-protocol-page'
import type { Route } from './+types/free-pyramid-protocol'
import { commandMatchAction, loadMatchProtocolPage } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'free-pyramid')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'free-pyramid')
}

export default function FreePyramidProtocolRoute() {
  return <MatchProtocolPage data={useLoaderData<typeof loader>()} />
}
