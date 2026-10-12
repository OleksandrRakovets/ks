import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '@/features/sparring/match/protocol/match-protocol-page'
import { loadMatchProtocolPage } from '@/routes/sparring/match/handlers'

import type { Route } from './+types/free-pyramid-protocol'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'free-pyramid')
}

export default function FreePyramidProtocolRoute() {
  return <MatchProtocolPage data={useLoaderData<typeof loader>()} />
}
