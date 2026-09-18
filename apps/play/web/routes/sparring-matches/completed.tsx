import { useLoaderData } from 'react-router'

import { MatchListPage } from '../../features/match-list/match-list-page'
import type { Route } from './+types/completed'
import { loadMatchList } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchList(args, 'completed')
}

export default function CompletedMatchesRoute() {
  return <MatchListPage data={useLoaderData<typeof loader>()} />
}
