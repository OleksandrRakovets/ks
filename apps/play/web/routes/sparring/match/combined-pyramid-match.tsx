import { useLoaderData } from 'react-router'

import { MatchPage } from '@/features/sparring/match/match-page'
import { CombinedPyramidControlRenderer } from '@/features/sparring/match/renderers/pyramid-control-renderer'

import type { Route } from './+types/combined-pyramid-match'
import { loadMatchPage, matchAction } from './handlers'

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'combined-pyramid')
}

export function action(args: Route.ActionArgs) {
  return matchAction(args, 'combined-pyramid')
}

export default function CombinedPyramidMatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={CombinedPyramidControlRenderer} />
}
