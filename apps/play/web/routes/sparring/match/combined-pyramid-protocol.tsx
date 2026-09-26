import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '@/features/sparring/match/protocol/match-protocol-page'

import type { Route } from './+types/combined-pyramid-protocol'
import { loadMatchProtocolPage } from './handlers'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'combined-pyramid')
}

export default function CombinedPyramidProtocolRoute() {
  return <MatchProtocolPage data={useLoaderData<typeof loader>()} />
}
