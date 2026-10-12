import { useLoaderData } from 'react-router'

import { MatchProtocolPage } from '@/features/sparring/match/protocol/match-protocol-page'
import { loadMatchProtocolPage } from '@/routes/sparring/match/handlers'

import type { Route } from './+types/strila-v2-protocol'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocolPage(args, 'strila-v2')
}

export default function StrilaV2ProtocolRoute() {
  return <MatchProtocolPage data={useLoaderData<typeof loader>()} />
}
