import { keys } from '@ks/i18n'
import type { SupportedLocale } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher, useLocation } from 'react-router'

import { localizedPath, pathForLocale } from '@/i18n'
import { useRootLocale, useRootTheme } from '@/root'
import type { AppTheme } from '@/server/theme'

import { Button, ResponsiveMenu, Separator, ToggleGroup, ToggleGroupItem } from './ui'

const THEME_OPTIONS: { value: AppTheme; labelKey: string }[] = [
  { value: 'club-dark', labelKey: keys.theme.dark },
  { value: 'club-light', labelKey: keys.theme.light },
  { value: 'auto', labelKey: keys.theme.auto },
]

const LOCALE_OPTIONS: { value: SupportedLocale; labelKey: string }[] = [
  { value: 'uk', labelKey: keys.language.ukrainian },
  { value: 'en', labelKey: keys.language.english },
]

export function BurgerMenu({ placement }: { placement?: 'header' | 'navigation' }) {
  const currentLocale = useRootLocale()
  const currentTheme = useRootTheme()
  const fetcher = useFetcher()
  const location = useLocation()
  const { t } = useTranslation()

  const sparringPath = localizedPath('/sparring/', currentLocale)

  const isNewMatchRoute =
    location.pathname === sparringPath || location.pathname.startsWith(`${sparringPath}setup/`)

  const matchesPath = localizedPath('/sparring/matches/', currentLocale)
  const isMatchesRoute = location.pathname.startsWith(matchesPath)

  function changeTheme(values: string[]) {
    const theme = values[0]

    if (isAppTheme(theme) && theme !== currentTheme) {
      void fetcher.submit({ theme }, { method: 'post', action: '/ui-preferences/theme/' })
    }
  }

  return (
    <ResponsiveMenu
      title={t(keys.nav.menu)}
      closeLabel={t(keys.nav.close)}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(keys.nav.menu)}
          className={
            placement === 'navigation'
              ? 'size-11 active:translate-y-0 lg:mr-2'
              : 'size-11 active:translate-y-0'
          }
        >
          <HamburgerIcon />
        </Button>
      }
    >
      {({ close }) => (
        <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-5 md:pt-4">
          <nav className="flex flex-col gap-1" aria-label={t(keys.nav.sparring)}>
            <h2 className="px-3 py-1 text-base font-semibold">{t(keys.nav.sparring)}</h2>
            <Link
              to={sparringPath}
              prefetch="render"
              onClick={close}
              aria-current={isNewMatchRoute ? 'page' : undefined}
              className="flex min-h-12 items-center rounded-md px-3 text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
            >
              {t(keys.nav.newGame)}
            </Link>
            <Link
              to={matchesPath}
              prefetch="render"
              onClick={close}
              aria-current={isMatchesRoute ? 'page' : undefined}
              className="flex min-h-12 items-center rounded-md px-3 text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
            >
              {t(keys.nav.allMatches)}
            </Link>
          </nav>

          <Separator className="my-4" />

          <div className="flex flex-col gap-3 px-3">
            <section
              className="flex min-h-11 items-center justify-between gap-3"
              aria-labelledby="theme-options-label"
            >
              <p id="theme-options-label" className="font-medium">
                {t(keys.theme.section)}
              </p>
              <ToggleGroup
                value={[currentTheme]}
                onValueChange={changeTheme}
                aria-labelledby="theme-options-label"
              >
                {THEME_OPTIONS.map(({ value, labelKey }) => (
                  <ToggleGroupItem key={value} value={value}>
                    {t(labelKey)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </section>

            <section
              className="flex min-h-11 items-center justify-between gap-3"
              aria-labelledby="locale-options-label"
            >
              <p id="locale-options-label" className="font-medium">
                {t(keys.language.section)}
              </p>
              <ToggleGroup value={[currentLocale]} aria-labelledby="locale-options-label">
                {LOCALE_OPTIONS.map(({ value, labelKey }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    nativeButton={false}
                    render={
                      <Link
                        reloadDocument
                        to={pathForLocale(location.pathname, location.search, location.hash, value)}
                      />
                    }
                  >
                    {t(labelKey)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </section>
          </div>
        </div>
      )}
    </ResponsiveMenu>
  )
}

function isAppTheme(value: string | undefined): value is AppTheme {
  return value === 'club-dark' || value === 'club-light' || value === 'auto'
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
