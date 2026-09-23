import { useLoaderData } from 'react-router'

import { MatchListPage } from '../../features/match-list/match-list-page'
import { localeFromContext } from '../../locale'
import { requireApplication } from '../../server/context'
import type { Route } from './+types/live'

export async function loader({ context }: Route.LoaderArgs) {
  const page = await requireApplication(context).listLiveMatches(localeFromContext(context))

  return {
    view: page.scope,
    page,
    updates: {
      kind: 'poll-scores' as const,
      matchIds: page.matches.filter((match) => match.status === 'active').map((match) => match.matchId),
      revalidateAfterMs: page.recentCompletionExpiresAfterMs,
    },
  }
}

export default function LiveMatchesRoute() {
  return <MatchListPage data={useLoaderData<typeof loader>()} />
}
