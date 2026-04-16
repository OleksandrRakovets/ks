import { listGameKeys, registry } from '@ks/gameplay'
import { keys } from '@ks/i18n'
import { Card, CardDescription, CardHeader, CardTitle } from '@ks/ui'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData } from 'react-router'

import { localeFromCookie } from '../server/locale'

type SparringGame = {
  gameKey: string
  title: string
}

export async function loader({ request }: { request: Request }) {
  const locale = localeFromCookie(request.headers.get('cookie'))
  const games: SparringGame[] = listGameKeys().map((gameKey) => ({
    gameKey,
    title: registry[gameKey].meta.title[locale],
  }))

  return { games }
}

export default function SparringRoute() {
  const { t } = useTranslation()
  const { games } = useLoaderData<typeof loader>()

  return (
    <main className="min-h-dvh flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">{t(keys.match.sparring.title)}</h1>
          <p className="mt-1 text-base text-muted-foreground">{t(keys.match.sparring.subtitle)}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Card key={game.gameKey}>
              <CardHeader>
                <CardTitle className="text-lg">
                  <Link className="underline-offset-4 hover:underline" to={`/sparring/init/${game.gameKey}`}>
                    {game.title}
                  </Link>
                </CardTitle>
                <CardDescription className="text-base">Description TBD...</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
