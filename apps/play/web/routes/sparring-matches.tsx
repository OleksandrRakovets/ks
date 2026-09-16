import { type MatchListPage, MatchListPagination } from '@ks/application'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData } from 'react-router'
import * as v from 'valibot'

import { Badge, Button } from '@/components/ui'

import { matchUrlForStatus } from '../features/match-urls'
import { localeFromContext, localizedPath } from '../locale'
import { useRootLocale } from '../root'
import type { AppLoadContext } from '../server/context'
import { requireApplication } from '../server/context'

type LoaderData = MatchListPage

export async function loader({
  request,
  context,
}: {
  request: Request
  context: AppLoadContext
}): Promise<LoaderData> {
  const application = requireApplication(context)
  const locale = localeFromContext(context)
  const url = new URL(request.url)

  if (url.searchParams.getAll('page').length > 1 || url.searchParams.getAll('pageSize').length > 1)
    throw new Response('Invalid Match list pagination', { status: 400 })

  const pagination = v.safeParse(MatchListPagination, {
    page: parsePositiveInteger(url.searchParams.get('page')),
    pageSize: parsePositiveInteger(url.searchParams.get('pageSize')),
  })

  if (!pagination.success) throw new Response('Invalid Match list pagination', { status: 400 })

  return application.listMatches(locale, pagination.output)
}

export const handle = {
  headerConfig: () => ({ titleKey: keys.nav.allMatches, backTo: '/sparring/' }),
}

export default function SparringMatchesRoute() {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const { matches } = useLoaderData<typeof loader>()

  return (
    <main className="flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t(keys.match.sparring.recentMatches)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(keys.match.sparring.recentMatchesSubtitle)}
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<Link to={localizedPath('/sparring/', locale)} />}
            variant="outline"
          >
            {t(keys.match.sparring.newMatch)}
          </Button>
        </div>

        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(keys.match.sparring.noRecentMatches)}</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {matches.map((match) => (
              <Link
                key={match.matchId}
                to={matchUrlForStatus(match.gameKey, match.matchId, match.status, locale)}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {match.participants.A.displayName} — {match.participants.B.displayName}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{match.gameTitle}</div>
                </div>
                <div className="shrink-0">
                  {match.status === 'active' ? (
                    <Badge variant="live">{t(keys.status.live)}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t(keys.status.finished)}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (value === null) return undefined

  if (!/^[1-9]\d*$/.test(value)) throw new Response('Invalid Match list pagination', { status: 400 })
  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed)) throw new Response('Invalid Match list pagination', { status: 400 })

  return parsed
}
