import { keys } from '@ks/i18n'
import { Badge, Button } from '@ks/ui'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData } from 'react-router'

import type { AppLoadContext } from '../server/context'
import { requireEnv } from '../server/context'
import { localeFromCookie } from '../server/locale'
import { listMatches } from '../server/match-room'

type LoaderData = {
  matches: Awaited<ReturnType<typeof listMatches>>
}

export async function loader({ request, context }: { request: Request; context: AppLoadContext }): Promise<LoaderData> {
  const env = requireEnv(context)
  const locale = localeFromCookie(request.headers.get('cookie'))

  return {
    matches: await listMatches(env, locale),
  }
}

export const handle = {
  headerConfig: () => ({ titleKey: keys.nav.allMatches, backTo: '/sparring/' }),
}

export default function SparringMatchesRoute() {
  const { t } = useTranslation()
  const { matches } = useLoaderData<typeof loader>()

  return (
    <main className="flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t(keys.match.sparring.recentMatches)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t(keys.match.sparring.recentMatchesSubtitle)}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/sparring/">{t(keys.match.sparring.newMatch)}</Link>
          </Button>
        </div>

        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(keys.match.sparring.noRecentMatches)}</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {matches.map((match) => (
              <Link
                key={match.matchId}
                to={
                  match.status === 'active'
                    ? `/sparring/matches/${match.matchId}/`
                    : `/sparring/matches/${match.matchId}/protocol/`
                }
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
                    <Badge>{t(keys.status.live)}</Badge>
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
