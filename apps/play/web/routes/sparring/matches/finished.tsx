import { MatchListDay } from '@ks/application'
import { useLoaderData } from 'react-router'
import * as v from 'valibot'

import { requireApplication } from '@/.server/context'
import { MatchListPage } from '@/features/sparring/matches/match-list-page'
import { localeFromContext } from '@/i18n'

import type { Route } from './+types/finished'

export async function loader({ context, params }: Pick<Route.LoaderArgs, 'context' | 'params'>) {
  const day = params.day === undefined ? undefined : v.safeParse(MatchListDay, params.day)

  if (day && !day.success) throw new Response('Match list not found', { status: 404 })

  const page = await requireApplication(context).sparring.listFinishedMatches(
    localeFromContext(context),
    day?.output,
  )

  return { view: page.scope, page, updates: { kind: 'none' as const } }
}

export default function FinishedMatchesRoute() {
  return <MatchListPage data={useLoaderData<typeof loader>()} />
}
