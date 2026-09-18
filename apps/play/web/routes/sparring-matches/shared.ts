import { MatchListPagination, type MatchListScope, RECENT_COMPLETED_MATCH_WINDOW_MS } from '@ks/application'
import { UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import type { MatchListRouteData } from '../../features/match-list/match-list-page'
import { localeFromContext } from '../../locale'
import type { AppLoadContext } from '../../server/context'
import { requireApplication } from '../../server/context'

type MatchListRouteArgs = {
  request: Request
  context: AppLoadContext
}

export async function loadMatchList(
  { request, context }: MatchListRouteArgs,
  scope: MatchListScope,
): Promise<MatchListRouteData> {
  const url = new URL(request.url)
  const pageParams = url.searchParams.getAll('page')

  const pagination = v.safeParse(MatchListPagination, {
    page: pageParams.length === 0 ? undefined : Number(pageParams[0]),
  })

  if (pageParams.length > 1 || !pagination.success) throw new Response('Match list not found', { status: 404 })

  const page = await requireApplication(context).listMatches(
    scope,
    localeFromContext(context),
    pagination.output,
  )

  if (scope === 'completed') return { view: scope, page, updates: { kind: 'none' } }

  const recentCompletions = page.matches.filter((match) => match.status === 'finished')

  const earliestExpiry = recentCompletions.reduce<number | undefined>((earliest, match) => {
    const expiresAt = match.endedAt + RECENT_COMPLETED_MATCH_WINDOW_MS

    return earliest === undefined ? expiresAt : Math.min(earliest, expiresAt)
  }, undefined)

  return {
    view: scope,
    page,
    updates: {
      kind: 'poll-scores',
      matchIds: page.matches.filter((match) => match.status === 'active').map((match) => match.matchId),
      revalidateAt: earliestExpiry === undefined ? undefined : v.parse(UnixEpochMilliseconds, earliestExpiry),
    },
  }
}
