import { useLoaderData } from 'react-router'

import { MatchPage } from '@/features/sparring/match/match-page'
import { StrilaControlRenderer } from '@/features/sparring/match/renderers/strila-control-renderer'
import { loadMatchPage, matchAction } from '@/routes/sparring/match/handlers'

import type { Route } from './+types/strila-v2-match'

export const handle = { inAppBrowserIntent: 'control' } as const

export function loader(args: Route.LoaderArgs) {
  return loadMatchPage(args, 'strila-v2')
}

export function action(args: Route.ActionArgs) {
  return matchAction(args, 'strila-v2')
}

export default function StrilaV2MatchRoute() {
  return <MatchPage data={useLoaderData<typeof loader>()} renderer={StrilaControlRenderer} />
}
