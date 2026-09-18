import { useLoaderData } from 'react-router'

import { MatchListPage } from '../../features/match-list/match-list-page'
import type { Route } from './+types/live'
import { loadMatchList } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchList(args, 'live')
}

export default function LiveMatchesRoute() {
  return <MatchListPage data={useLoaderData<typeof loader>()} />
}
