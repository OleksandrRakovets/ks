import { type RegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Page } from '@/components/Page'
import { Button, Card, CardFooter, CardHeader, CardTitle, Separator } from '@/components/ui'

import { localizedPath } from '../locale'
import { useRootLocale } from '../root'

export default function SparringRoute() {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const strilaRulesUrl = locale === 'uk' ? 'https://strila.pro/pravyla/' : 'https://strila.pro/en/rules/'
  const barabanRulesUrl = locale === 'uk' ? 'https://strila.pro/baraban-3/' : 'https://strila.pro/en/baraban/'

  return (
    <Page title={t(keys.match.sparring.title)}>
      <section className="grid gap-4 md:grid-cols-2" aria-label={t(keys.match.sparring.games.featured)}>
        <Card>
          <CardHeader className="flex-row items-center gap-4 border-b-0 pb-2">
            <GameBadge src="/games/strila.webp" />
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-[22px] font-bold">
                {registry['strila-v2'].meta.title[locale]}
              </CardTitle>
              <p className="leading-relaxed text-muted-foreground">
                {t(keys.match.sparring.games.strila.description)}
              </p>
            </div>
          </CardHeader>
          <CardFooter className="mt-auto justify-between">
            <RulesLink href={strilaRulesUrl}>{t(keys.match.sparring.games.rules)}</RulesLink>
            <Button
              nativeButton={false}
              render={<Link to={localizedPath('/sparring/init/strila-v2/', locale)} />}
              size="touch"
              className="min-w-28"
            >
              {t(keys.match.sparring.games.play)}
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-border/70 bg-overlay/50">
          <CardHeader className="flex-row items-center gap-4 border-b-0 pb-2">
            <GameBadge src="/games/baraban.webp" />
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-[22px] font-bold text-muted-foreground">
                {t(keys.match.sparring.games.baraban.title)}
              </CardTitle>
              <p className="leading-relaxed text-muted-foreground">
                {t(keys.match.sparring.games.baraban.description)}
              </p>
            </div>
          </CardHeader>
          <CardFooter className="mt-auto justify-between">
            <RulesLink href={barabanRulesUrl}>{t(keys.match.sparring.games.rules)}</RulesLink>
            <Button variant="outline" size="touch" className="min-w-28" disabled>
              {t(keys.nav.comingSoon)}
            </Button>
          </CardFooter>
        </Card>
      </section>

      <Separator />

      <section className="flex flex-col gap-4" aria-labelledby="pyramid-title">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 id="pyramid-title" className="text-[22px] font-bold">
            {t(keys.match.sparring.games.pyramid.title)}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {t(keys.match.sparring.games.pyramid.description)}
          </p>
        </div>

        <Card className="divide-y divide-border">
          <PyramidGameLink gameKey="free-pyramid">
            {t(keys.match.sparring.games.freePyramid.description)}
          </PyramidGameLink>
          <PyramidGameLink gameKey="free-pyramid-long">
            {t(keys.match.sparring.games.longFreePyramid.description)}
          </PyramidGameLink>
          <PyramidGameLink gameKey="combined-pyramid">
            <span className="inline-flex rounded-md border border-dashed border-amber/60 px-2 py-1 text-amber">
              {t(keys.match.sparring.games.combinedPyramid.placeholder)}
            </span>
          </PyramidGameLink>
          <PyramidGameLink gameKey="combined-pyramid-old">
            {t(keys.match.sparring.games.oldCombinedPyramid.description)}
          </PyramidGameLink>
        </Card>
      </section>
    </Page>
  )
}

function GameBadge({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      width="64"
      height="64"
      className="size-16 shrink-0 object-contain drop-shadow-[0_2px_3px_rgb(0_0_0/0.22)]"
    />
  )
}

function RulesLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 rounded-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {children}
      {'\u00a0↗'}
    </a>
  )
}

function PyramidGameLink({ gameKey, children }: { gameKey: RegisteredGameKey; children: React.ReactNode }) {
  const locale = useRootLocale()

  return (
    <Link
      to={localizedPath(`/sparring/init/${gameKey}/`, locale)}
      className="group flex min-h-20 items-center justify-between gap-4 px-5 py-4 transition-colors outline-none first:rounded-t-lg last:rounded-b-lg hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-lg font-semibold">{registry[gameKey].meta.title[locale]}</span>
        <span className="leading-relaxed text-muted-foreground">{children}</span>
      </span>
      <ChevronRightIcon />
    </Link>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
