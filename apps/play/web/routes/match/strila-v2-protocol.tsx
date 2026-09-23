import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '../../features/match-protocol/match-protocol-page'
import type { Route } from './+types/strila-v2-protocol'
import { commandMatchAction, loadMatchProtocolPage } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'strila-v2')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'strila-v2')
}

export default function StrilaV2ProtocolRoute() {
  return <MatchProtocolPage data={useLoaderData<typeof loader>()} />
}
