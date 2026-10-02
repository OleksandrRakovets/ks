import { MatchListDay } from '@ks/application'
import { Result, Schema } from 'effect'
import { useLoaderData } from 'react-router'

import { MatchListPage } from '@/features/sparring/matches/match-list-page'
import { localeFromContext } from '@/i18n'
import { requireApplication } from '@/server/context.server'

import type { Route } from './+types/finished'

export async function loader({ context, params }: Pick<Route.LoaderArgs, 'context' | 'params'>) {
  const day = params.day === undefined ? undefined : Schema.decodeUnknownResult(MatchListDay)(params.day)

  if (day !== undefined && Result.isFailure(day)) throw new Response('Match list not found', { status: 404 })

  const page = await requireApplication(context).sparring.listFinishedMatches(
    localeFromContext(context),
    day?.success,
  )

  return { view: page.scope, page, updates: { kind: 'none' as const } }
}

export default function FinishedMatchesRoute() {
  return <MatchListPage data={useLoaderData<typeof loader>()} />
}
