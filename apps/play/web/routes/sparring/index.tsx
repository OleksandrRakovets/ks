import type { GameKey } from '@ks/gameplay/definitions'
import { Link } from 'react-router'

import { Page } from '@/components/page'
import { Badge, Card, CardFooter, CardHeader, CardTitle } from '@/components/ui'
import { matchSetupUrl } from '@/features/sparring/urls'
import { useRootLocale } from '@/root'

export default function SparringRoute() {
  const locale = useRootLocale()

  return locale === 'uk' ? <UkrainianSparringIndex /> : <EnglishSparringIndex />
}

// This curated page is intentionally hand-crafted as per-locale JSX. Keep all shelf copy here,
// including game names, so each locale's content and layout can evolve independently.
function UkrainianSparringIndex() {
  return (
    <Page title="Спаринг">
      <section className="grid gap-4 md:grid-cols-2" aria-label="Ігри для спарингу">
        <GameCard
          gameKey="strila-v2"
          title="Стріла"
          description="Українська гра зі спеціально розробленими кольоровими кулями на звичних столах."
          playLabel="Грати в Стрілу"
          badgeSrc="/games/strila.webp"
          rulesHref="https://strila.pro/pravyla/"
          rulesLabel="Правила на strila.pro"
        />
        <GameCard
          gameKey="free-pyramid-long"
          title="Вільна піраміда з продовженням"
          description="Довга партія до визначеної кількості очок."
          playLabel="Грати у Вільну піраміду з продовженням"
        />
        <GameCard
          title="Барабан"
          description="Варіація для двох комплектів куль Стріли. Перемагає той, хто першим забиває свої кулі."
          badgeSrc="/games/baraban.webp"
          rulesHref="https://strila.pro/baraban-3/"
          rulesLabel="Правила на strila.pro"
          status="Скоро"
        />
        <GameCard
          gameKey="combined-pyramid-old"
          title="Комбінована піраміда за старими правилами"
          description="Традиційна клубна гра, зазвичай із замовленням куль."
          playLabel="Грати в Комбіновану піраміду за старими правилами"
        />
        <GameCard
          gameKey="combined-pyramid"
          title="Комбінована піраміда"
          description="Спортивні правила, без замовлення."
          playLabel="Грати в Комбіновану піраміду"
        />
        <GameCard
          gameKey="free-pyramid"
          title="Вільна піраміда"
          description="Спортивні правила."
          playLabel="Грати у Вільну піраміду"
        />
      </section>
    </Page>
  )
}

function EnglishSparringIndex() {
  return (
    <Page title="Sparring">
      <section className="grid gap-4 md:grid-cols-2" aria-label="Sparring games">
        <GameCard
          gameKey="strila-v2"
          title="Strila"
          description="A Ukrainian game with specially designed coloured balls, played on standard tables."
          playLabel="Play Strila"
          badgeSrc="/games/strila.webp"
          rulesHref="https://strila.pro/en/rules/"
          rulesLabel="Rules at strila.pro"
        />
        <GameCard
          gameKey="free-pyramid-long"
          title="Continuous Free Pyramid"
          description="One frame continues across successive racks to a set points target."
          playLabel="Play Continuous Free Pyramid"
        />
        <GameCard
          title="Baraban"
          description="A variant for two sets of Strila balls. The first player to pot all their balls wins."
          badgeSrc="/games/baraban.webp"
          rulesHref="https://strila.pro/en/baraban/"
          rulesLabel="Rules at strila.pro"
          status="Coming soon"
        />
        <GameCard
          gameKey="combined-pyramid-old"
          title="Combined Pyramid under the old rules"
          description="A traditional club game, usually played with called balls."
          playLabel="Play Combined Pyramid under the old rules"
        />
        <GameCard
          gameKey="combined-pyramid"
          title="Combined Pyramid"
          description="Competition rules, without called shots."
          playLabel="Play Combined Pyramid"
        />
        <GameCard
          gameKey="free-pyramid"
          title="Free Pyramid"
          description="Competition rules."
          playLabel="Play Free Pyramid"
        />
      </section>
    </Page>
  )
}

function GameCard({
  title,
  description,
  gameKey,
  playLabel,
  badgeSrc,
  rulesHref,
  rulesLabel,
  status,
}: {
  title: React.ReactNode
  description: React.ReactNode
  gameKey?: GameKey
  playLabel?: string
  badgeSrc?: string
  rulesHref?: string
  rulesLabel?: string
  status?: React.ReactNode
}) {
  const locale = useRootLocale()
  const playable = gameKey !== undefined && playLabel !== undefined

  return (
    <Card
      className={
        playable
          ? 'group relative isolate h-full overflow-hidden p-5 transition-colors hover:bg-muted/50'
          : 'relative isolate h-full border-border/70 bg-overlay/50 p-5'
      }
    >
      {playable ? (
        <Link
          to={matchSetupUrl(gameKey, locale)}
          prefetch="viewport"
          aria-label={playLabel}
          className="absolute inset-0 z-10 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
        />
      ) : null}

      <CardHeader className={badgeSrc !== undefined ? 'relative border-b-0 p-0 pr-24' : 'border-b-0 p-0'}>
        {badgeSrc !== undefined ? (
          <div className="absolute top-0 right-0">
            <GameBadge src={badgeSrc} />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle
            className={
              playable
                ? 'text-[22px] leading-snug font-bold'
                : 'text-[22px] leading-snug font-bold text-muted-foreground'
            }
          >
            {title}
          </CardTitle>
          <p className="leading-normal text-muted-foreground">{description}</p>
        </div>
      </CardHeader>

      {rulesHref !== undefined && rulesLabel !== undefined ? (
        <CardFooter className="mt-auto justify-between border-t-0 p-0 pt-4">
          <RulesLink href={rulesHref}>{rulesLabel}</RulesLink>
          {status !== undefined ? <Badge variant="neutral">{status}</Badge> : null}
        </CardFooter>
      ) : null}
    </Card>
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
      className="relative z-20 shrink-0 rounded-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {children}
      {'\u00a0↗'}
    </a>
  )
}
