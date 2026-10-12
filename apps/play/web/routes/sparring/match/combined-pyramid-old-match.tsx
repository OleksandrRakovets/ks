import { useLoaderData } from 'react-router'

import { MatchPage } from '@/features/sparring/match/match-page'
import { CombinedPyramidOldControlRenderer } from '@/features/sparring/match/renderers/pyramid-control-renderer'

import type { Route } from './+types/combined-pyramid-old-match'
import { loadMatchPage, matchAction } from './handlers'

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'combined-pyramid-old')
}

export function action(args: Route.ActionArgs) {
  return matchAction(args, 'combined-pyramid-old')
}

export default function CombinedPyramidOldMatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={CombinedPyramidOldControlRenderer} />
}
