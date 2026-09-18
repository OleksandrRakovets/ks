import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { Link } from 'react-router'

import { Page } from '@/components/Page'
import { Button, Card, CardFooter, CardHeader, CardTitle, Separator } from '@/components/ui'

import { localizedPath } from '../locale'
import { useRootLocale } from '../root'

export default function SparringRoute() {
  const locale = useRootLocale()

  return locale === 'uk' ? <UkrainianSparringIndex /> : <EnglishSparringIndex />
}

// This curated page is intentionally hand-crafted as per-locale JSX. Keep all shelf copy here,
// including game names, so each locale's content and layout can evolve independently.
function UkrainianSparringIndex() {
  const locale = 'uk'

  return (
    <Page title="Спаринг">
      <section className="grid gap-4 md:grid-cols-2" aria-label="Ігри для спарингу">
        <Card>
          <CardHeader className="flex-row items-center gap-4 border-b-0 pb-2">
            <GameBadge src="/games/strila.webp" />
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-[22px] font-bold">Стріла</CardTitle>
              <p className="leading-relaxed text-muted-foreground">
                Українська гра зі спеціально розробленими кольоровими кулями на звичних столах.
              </p>
            </div>
          </CardHeader>
          <CardFooter className="mt-auto justify-between">
            <RulesLink href="https://strila.pro/pravyla/">Правила на strila.pro</RulesLink>
            <Button
              nativeButton={false}
              render={<Link to={localizedPath('/sparring/init/strila-v2/', locale)} />}
              size="touch"
              className="min-w-28"
            >
              Грати
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-border/70 bg-overlay/50">
          <CardHeader className="flex-row items-center gap-4 border-b-0 pb-2">
            <GameBadge src="/games/baraban.webp" />
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-[22px] font-bold text-muted-foreground">Барабан</CardTitle>
              <p className="leading-relaxed text-muted-foreground">
                Варіація для двох комплектів куль Стріли. Перемагає той, хто першим забиває свої кулі.
              </p>
            </div>
          </CardHeader>
          <CardFooter className="mt-auto justify-between">
            <RulesLink href="https://strila.pro/baraban-3/">Правила на strila.pro</RulesLink>
            <Button variant="outline" size="touch" className="min-w-28" disabled>
              Скоро
            </Button>
          </CardFooter>
        </Card>
      </section>

      <Separator />

      <section className="flex flex-col gap-4" aria-labelledby="pyramid-title">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 id="pyramid-title" className="text-[22px] font-bold">
            Піраміда
          </h2>
        </div>

        <Card className="divide-y divide-border">
          <PyramidGameLink gameKey="free-pyramid-long" title="Вільна піраміда з продовженням">
            Довга партія до визначеної кількості очок.
          </PyramidGameLink>
          <PyramidGameLink gameKey="combined-pyramid-old" title="Комбінована піраміда за старими правилами">
            Традиційна клубна гра, зазвичай із замовленням куль.
          </PyramidGameLink>
          <PyramidGameLink gameKey="combined-pyramid" title="Комбінована піраміда">
            Спортивні правила, без замовлення.
          </PyramidGameLink>
          <PyramidGameLink gameKey="free-pyramid" title="Вільна піраміда">
            Спортивні правила.
          </PyramidGameLink>
        </Card>
      </section>
    </Page>
  )
}

function EnglishSparringIndex() {
  const locale = 'en'

  return (
    <Page title="Sparring">
      <section className="grid gap-4 md:grid-cols-2" aria-label="Sparring games">
        <Card>
          <CardHeader className="flex-row items-center gap-4 border-b-0 pb-2">
            <GameBadge src="/games/strila.webp" />
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-[22px] font-bold">Strila</CardTitle>
              <p className="leading-relaxed text-muted-foreground">Coloured balls and alternating turns.</p>
            </div>
          </CardHeader>
          <CardFooter className="mt-auto justify-between">
            <RulesLink href="https://strila.pro/en/rules/">Rules at strila.pro</RulesLink>
            <Button
              nativeButton={false}
              render={<Link to={localizedPath('/sparring/init/strila-v2/', locale)} />}
              size="touch"
              className="min-w-28"
            >
              Play
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-border/70 bg-overlay/50">
          <CardHeader className="flex-row items-center gap-4 border-b-0 pb-2">
            <GameBadge src="/games/baraban.webp" />
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-[22px] font-bold text-muted-foreground">Baraban</CardTitle>
              <p className="leading-relaxed text-muted-foreground">Game support is coming soon.</p>
            </div>
          </CardHeader>
          <CardFooter className="mt-auto justify-between">
            <RulesLink href="https://strila.pro/en/baraban/">Rules at strila.pro</RulesLink>
            <Button variant="outline" size="touch" className="min-w-28" disabled>
              Coming soon
            </Button>
          </CardFooter>
        </Card>
      </section>

      <Separator />

      <section className="flex flex-col gap-4" aria-labelledby="pyramid-title">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 id="pyramid-title" className="text-[22px] font-bold">
            Pyramid
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Four variants of one game. Every ball is worth one point; the rest differs.
          </p>
        </div>

        <Card className="divide-y divide-border">
          <PyramidGameLink gameKey="free-pyramid" title="Free pyramid">
            Any legally potted ball counts.
          </PyramidGameLink>
          <PyramidGameLink gameKey="free-pyramid-long" title="Long free pyramid">
            One long frame played across multiple racks.
          </PyramidGameLink>
          <PyramidGameLink gameKey="combined-pyramid" title="Combined pyramid">
            <span className="inline-flex rounded-md border border-dashed border-amber/60 px-2 py-1 text-amber">
              Distinctive description needed
            </span>
          </PyramidGameLink>
          <PyramidGameLink gameKey="combined-pyramid-old" title="Combined pyramid (old rules)">
            After a foul, the offender first repays the balls they owe.
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

function PyramidGameLink({
  gameKey,
  title,
  children,
}: {
  gameKey: RegisteredGameKey
  title: React.ReactNode
  children: React.ReactNode
}) {
  const locale = useRootLocale()

  return (
    <Link
      to={localizedPath(`/sparring/init/${gameKey}/`, locale)}
      className="group flex min-h-20 items-center justify-between gap-4 px-5 py-4 transition-colors outline-none first:rounded-t-lg last:rounded-b-lg hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-lg font-semibold">{title}</span>
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
