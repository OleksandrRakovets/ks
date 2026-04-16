import { keys } from '@ks/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@ks/ui'
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

export default function SparringMatchesRoute() {
  const { t } = useTranslation()
  const { matches } = useLoaderData<typeof loader>()

  return (
    <main className="min-h-dvh flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t(keys.match.sparring.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recent sparring matches.</p>
        </div>

        {matches.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">No sparring matches yet.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {matches.map((match) => (
              <Card key={match.matchId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">
                    <Link className="underline-offset-4 hover:underline" to={`/sparring/matches/${match.matchId}`}>
                      {match.participants.A.displayName} vs {match.participants.B.displayName}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-1 text-sm text-muted-foreground">
                  <div>{match.gameTitle}</div>
                  <div>Status: {match.status}</div>
                  <div>{new Date(match.createdAt).toLocaleString()}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
