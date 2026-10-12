import { useLoaderData } from 'react-router'

import { MatchListPage } from '@/features/sparring/matches/match-list-page'
import { localeFromContext } from '@/i18n'
import { requireApplication } from '@/server/context.server'

import type { Route } from './+types/live'

export async function loader({ context }: Route.LoaderArgs) {
  const page = await requireApplication(context).sparring.listLiveMatches(localeFromContext(context))

  return {
    view: page.scope,
    page,
    updates: {
      kind: 'poll-scores' as const,
      matchIds: page.matches.filter((match) => match.status === 'active').map((match) => match.matchId),
    },
  }
}

export default function LiveMatchesRoute() {
  return <MatchListPage data={useLoaderData<typeof loader>()} />
}
