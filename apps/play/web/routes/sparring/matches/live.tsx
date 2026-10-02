import { SparringService } from '@ks/application/server'
import { Effect } from 'effect'
import { useLoaderData } from 'react-router'

import { MatchListPage } from '@/features/sparring/matches/match-list-page'
import { localeFromContext } from '@/i18n'
import { applicationStorageErrorResponse } from '@/server/application-storage-error.server'
import { requireRunEffect } from '@/server/context.server'

import type { Route } from './+types/live'

export async function loader({ context }: Route.LoaderArgs) {
  const page = await requireRunEffect(context)(
    SparringService.use((sparring) => sparring.listLiveMatches(localeFromContext(context))).pipe(
      Effect.catchTags({
        ApplicationStorageError: (error) => Effect.succeed(applicationStorageErrorResponse(error)),
      }),
    ),
  )

  if (page instanceof Response) throw page

  return {
    view: page.scope,
    page,
    updates: {
      kind: 'poll-scores' as const,
      matchIds: page.matches.filter((match) => match.status === 'active').map((match) => match.matchId),
      revalidateAfterMs: page.recentFinishedMatchExpiresAfterMs,
    },
  }
}

export default function LiveMatchesRoute() {
  return <MatchListPage data={useLoaderData<typeof loader>()} />
}
