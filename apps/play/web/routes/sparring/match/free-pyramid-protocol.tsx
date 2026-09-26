import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '@/features/sparring/match/protocol/match-protocol-page'

import type { Route } from './+types/free-pyramid-protocol'
import { loadMatchProtocolPage } from './handlers'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'free-pyramid')
}

export default function FreePyramidProtocolRoute() {
  return <MatchProtocolPage data={useLoaderData<typeof loader>()} />
}
