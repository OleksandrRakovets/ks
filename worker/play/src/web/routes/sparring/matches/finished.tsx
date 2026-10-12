import { MatchListDay } from '@ks/application'
import { redirect, useLoaderData } from 'react-router'
import * as v from 'valibot'

import { MatchListPage } from '@/features/sparring/matches/match-list-page'
import { finishedMatchesUrl } from '@/features/sparring/urls'
import { localeFromContext } from '@/i18n'
import { requireApplication } from '@/server/context.server'

import type { Route } from './+types/finished'

export async function loader({ context, params }: Pick<Route.LoaderArgs, 'context' | 'params'>) {
  const application = requireApplication(context)
  const locale = localeFromContext(context)

  // The dated URL is canonical; the bare path follows the latest day, so its redirect is temporary.
  if (params.day === undefined)
    throw redirect(finishedMatchesUrl(await application.sparring.latestFinishedMatchDay(), locale))

  const day = v.safeParse(MatchListDay, params.day)

  if (!day.success) throw new Response('Match list not found', { status: 404 })

  const page = await application.sparring.listFinishedMatches(locale, day.output)

  return { view: page.scope, page, updates: { kind: 'none' as const } }
}

export default function FinishedMatchesRoute() {
  return <MatchListPage data={useLoaderData<typeof loader>()} />
}
