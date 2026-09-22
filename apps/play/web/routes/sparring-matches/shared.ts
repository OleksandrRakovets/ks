import { MatchListPagination, type MatchListScope } from '@ks/application'
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
  const hasUnknownParams = [...url.searchParams.keys()].some((key) => key !== 'page')

  const pagination = v.safeParse(MatchListPagination, {
    page: pageParams.length === 0 ? undefined : Number(pageParams[0]),
  })

  if (hasUnknownParams || pageParams.length > 1 || !pagination.success) {
    throw new Response('Match list not found', { status: 404 })
  }

  const locale = localeFromContext(context)
  const page = await requireApplication(context).listMatches(scope, locale, pagination.output)

  if (scope === 'completed') return { view: scope, page, updates: { kind: 'none' } }

  return {
    view: scope,
    page,
    updates: {
      kind: 'poll-scores',
      matchIds: page.matches.filter((match) => match.status === 'active').map((match) => match.matchId),
      revalidateAfterMs: page.recentCompletionExpiresAfterMs,
    },
  }
}
