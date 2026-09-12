import type { MatchListEntry } from '@ks/application'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData } from 'react-router'

import { Page } from '@/components/Page'
import { Badge } from '@/components/ui'

import { matchUrlForStatus } from '../features/match-urls'
import { localeFromContext } from '../locale'
import { useRootLocale } from '../root'
import type { AppLoadContext } from '../server/context'
import { requireApplication } from '../server/context'

type LoaderData = {
  matches: MatchListEntry[]
}

export async function loader({ context }: { context: AppLoadContext }): Promise<LoaderData> {
  const application = requireApplication(context)
  const locale = localeFromContext(context)

  return {
    matches: await application.listMatches(locale),
  }
}

export default function SparringMatchesRoute() {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const { matches } = useLoaderData<typeof loader>()

  return (
    <Page title={t(keys.nav.matches)}>
      {matches.length === 0 ? (
        <p className="text-muted-foreground">{t(keys.match.sparring.noRecentMatches)}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {matches.map((match) => (
            <Link
              key={match.matchId}
              to={matchUrlForStatus(match.gameKey, match.matchId, match.status, locale)}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {match.participants.A.displayName} — {match.participants.B.displayName}
                </div>
                <div className="mt-0.5 text-muted-foreground">{match.gameTitle}</div>
              </div>
              <div className="shrink-0">
                {match.status === 'active' ? (
                  <Badge variant="live">{t(keys.status.live)}</Badge>
                ) : (
                  <span className="text-muted-foreground">{t(keys.status.finished)}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  )
}
