import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '@/features/sparring/match/protocol/match-protocol-page'

import type { Route } from './+types/combined-pyramid-old-protocol'
import { commandMatchAction, loadMatchProtocolPage } from './handlers'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'combined-pyramid-old')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'combined-pyramid-old')
}

export default function CombinedPyramidOldProtocolRoute() {
  return <MatchProtocolPage data={useLoaderData<typeof loader>()} />
}
