import { keys } from '@ks/i18n'
import { Button, Card, CardDescription, CardHeader, CardTitle } from '@ks/ui'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

type LocalizedSparringGameText = {
  uk: string
  en: string
}

type SparringGame = {
  gameKey: string
  title: LocalizedSparringGameText
  description: LocalizedSparringGameText
}

const SPARRING_GAMES: SparringGame[] = [
  {
    gameKey: 'strila-v2',
    title: {
      uk: 'Стріла',
      en: 'Strila',
    },
    description: {
      uk: 'Класична стріла — чергування ходів, забивання кольорових куль.',
      en: 'Classic Strila — alternating shots, potting coloured balls.',
    },
  },
  {
    gameKey: 'free-pyramid',
    title: {
      uk: 'Вільна піраміда',
      en: 'Free pyramid',
    },
    description: {
      uk: 'Удари по будь-якій кулі: +1, +2 або +4 очки. Фол — суперник +1.',
      en: 'Pot any ball for +1, +2, or +4 points. Foul gives opponent +1.',
    },
  },
  {
    gameKey: 'free-pyramid-long',
    title: {
      uk: 'Вільна піраміда з продовженням',
      en: 'Free pyramid (long)',
    },
    description: {
      uk: 'Вільна піраміда до 30 очок — довга партія для серйозної гри.',
      en: 'Free pyramid to 30 points — extended frame for a serious game.',
    },
  },
  {
    gameKey: 'combined-pyramid',
    title: {
      uk: 'Комбінована піраміда',
      en: 'Combined pyramid',
    },
    description: {
      uk: 'Удари +1 або +2 очки. Фол — суперник +1.',
      en: 'Pot for +1 or +2 points. Foul gives opponent +1.',
    },
  },
  {
    gameKey: 'combined-pyramid-old',
    title: {
      uk: 'Комбінована піраміда (старі правила)',
      en: 'Combined pyramid (old rules)',
    },
    description: {
      uk: "Комбінована піраміда: фол — -1 порушнику, рахунок може бути від'ємним.",
      en: 'Combined pyramid: foul deducts -1 from offender, score may go negative.',
    },
  },
]

export const handle = {
  headerConfig: () => ({ titleKey: keys.nav.sparring }),
}

export default function SparringRoute() {
  const { i18n, t } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'uk'

  return (
    <main className="flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t(keys.match.sparring.title)}</h1>
            <p className="mt-1 text-text-lo">{t(keys.match.sparring.subtitle)}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/sparring/matches/">{t(keys.match.sparring.recentMatches)}</Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SPARRING_GAMES.map((game) => (
            <Card key={game.gameKey}>
              <CardHeader>
                <CardTitle className="text-lg">
                  <Link className="underline-offset-4 hover:underline" to={`/sparring/init/${game.gameKey}/`}>
                    {game.title[locale]}
                  </Link>
                </CardTitle>
                <CardDescription className="text-text-lo">{game.description[locale]}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
