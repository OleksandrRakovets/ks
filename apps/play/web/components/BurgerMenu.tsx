import { keys } from '@ks/i18n'
import type { SupportedLocale } from '@ks/i18n'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher, useLocation } from 'react-router'

import { localizedPath, pathForLocale } from '../locale'
import { useRootLocale, useRootTheme } from '../root'
import type { AppTheme } from '../server/theme'
import {
  Badge,
  Button,
  NavigationLink,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from './ui'

const THEME_OPTIONS: { value: AppTheme; labelKey: string }[] = [
  { value: 'club-dark', labelKey: keys.theme.dark },
  { value: 'club-light', labelKey: keys.theme.light },
  { value: 'auto', labelKey: keys.theme.auto },
]

const LOCALE_OPTIONS: { value: SupportedLocale; labelKey: string }[] = [
  { value: 'uk', labelKey: keys.language.ukrainian },
  { value: 'en', labelKey: keys.language.english },
]

export function BurgerMenu({
  matchCount,
  placement,
}: {
  matchCount?: number
  placement?: 'header' | 'navigation'
}) {
  const [open, setOpen] = useState(false)
  const currentLocale = useRootLocale()
  const currentTheme = useRootTheme()
  const fetcher = useFetcher()
  const location = useLocation()
  const { t } = useTranslation()
  const sparringPath = localizedPath('/sparring/', currentLocale)

  const isNewMatchRoute =
    location.pathname === sparringPath || location.pathname.startsWith(`${sparringPath}init/`)

  const isMatchesRoute = location.pathname === localizedPath('/sparring/matches/', currentLocale)

  function changeTheme(values: string[]) {
    const theme = values[0]

    if (isAppTheme(theme) && theme !== currentTheme) {
      void fetcher.submit({ theme }, { method: 'post', action: '/ui-preferences/theme/' })
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label={t(keys.nav.menu)} />}
        className={placement === 'navigation' ? 'lg:mr-2' : 'size-11'}
      >
        <HamburgerIcon />
      </SheetTrigger>

      <SheetContent
        aria-label={t(keys.nav.menu)}
        className="inset-x-0 top-auto bottom-0 max-h-[calc(100dvh-1rem)] w-full rounded-t-2xl border-t border-r-0 border-b-0 border-l-0 shadow-2xl data-ending-style:translate-x-0 data-ending-style:translate-y-8 data-starting-style:translate-x-0 data-starting-style:translate-y-8 sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2"
      >
        <SheetTitle className="sr-only">{t(keys.nav.menu)}</SheetTitle>
        <SheetClose
          aria-label={t(keys.nav.close)}
          className="mx-auto flex h-9 w-16 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </SheetClose>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-5">
          <nav className="flex flex-col gap-1" aria-label={t(keys.nav.sparring)}>
            <h2 className="px-3 py-1 text-base font-semibold">{t(keys.nav.sparring)}</h2>
            <NavigationLink
              render={<Link to={sparringPath} onClick={() => setOpen(false)} />}
              state={isNewMatchRoute ? 'active' : 'default'}
              indicator="short"
            >
              {t(keys.nav.newGame)}
            </NavigationLink>
            <NavigationLink
              render={
                <Link to={localizedPath('/sparring/matches/', currentLocale)} onClick={() => setOpen(false)} />
              }
              state={isMatchesRoute ? 'active' : 'default'}
              indicator="short"
              className="justify-between"
            >
              <span>{t(keys.nav.matches)}</span>
              {matchCount === undefined ? null : (
                <span className="text-text-lo tabular-nums">{matchCount}</span>
              )}
            </NavigationLink>
            <FutureModule title={t(keys.nav.clubs)} comingSoon={t(keys.nav.comingSoon)} />
            <FutureModule title={t(keys.nav.tournaments)} comingSoon={t(keys.nav.comingSoon)} />
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
      </SheetContent>
    </Sheet>
  )
}

function FutureModule({ title, comingSoon }: { title: string; comingSoon: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-3 text-text-lo">
      <h2 className="font-semibold">{title}</h2>
      <Badge>{comingSoon}</Badge>
    </div>
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
