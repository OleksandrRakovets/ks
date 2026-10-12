import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '@/features/sparring/match/protocol/match-protocol-page'
import { loadMatchProtocolPage } from '@/routes/sparring/match/handlers'

import type { Route } from './+types/combined-pyramid-protocol'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'combined-pyramid')
}

export default function CombinedPyramidProtocolRoute() {
  return <MatchProtocolPage data={useLoaderData<typeof loader>()} />
}
