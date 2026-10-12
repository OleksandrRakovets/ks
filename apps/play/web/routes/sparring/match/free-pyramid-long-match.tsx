import { useLoaderData } from 'react-router'

import { MatchPage } from '@/features/sparring/match/match-page'
import { LongFreePyramidControlRenderer } from '@/features/sparring/match/renderers/long-free-pyramid-control-renderer'

import type { Route } from './+types/free-pyramid-long-match'
import { loadMatchPage, matchAction } from './handlers'

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'free-pyramid-long')
}

export function action(args: Route.ActionArgs) {
  return matchAction(args, 'free-pyramid-long')
}

export default function FreePyramidLongMatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={LongFreePyramidControlRenderer} />
}
