import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '../../features/match-protocol/match-protocol-page'
import type { Route } from './+types/combined-pyramid-protocol'
import { commandMatchAction, loadMatchProtocolPage } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'combined-pyramid')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'combined-pyramid')
}

export default function CombinedPyramidProtocolRoute() {
  const data = useLoaderData<typeof loader>()

  return <MatchProtocolPage control={data.control} protocol={data.protocol} />
}
