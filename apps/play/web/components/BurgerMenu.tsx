import { keys } from '@ks/i18n'
import type { SupportedLocale } from '@ks/i18n'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher, useLocation } from 'react-router'

import { localizedPath, pathForLocale } from '../locale'
import { useRootLocale, useRootTheme } from '../root'
import type { AppTheme } from '../server/theme'
import {
  Button,
  NavigationLink,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from './ui/v2'

const THEME_OPTIONS: { value: AppTheme; labelKey: string }[] = [
  { value: 'club-dark', labelKey: keys.theme.dark },
  { value: 'club-light', labelKey: keys.theme.light },
  { value: 'auto', labelKey: keys.theme.auto },
]

const LOCALE_OPTIONS: { value: SupportedLocale; labelKey: string }[] = [
  { value: 'uk', labelKey: keys.language.ukrainian },
  { value: 'en', labelKey: keys.language.english },
]

export function BurgerMenu(props: { placement?: 'header' | 'navigation' }) {
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
      fetcher.submit({ theme }, { method: 'post', action: '/ui-preferences/theme/' })
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label={t(keys.nav.menu)} />}
        className={props.placement === 'navigation' ? 'lg:mr-2' : undefined}
      >
        <HamburgerIcon />
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t(keys.appTitle)}</SheetTitle>
          <SheetDescription>{t(keys.nav.menu)}</SheetDescription>
        </SheetHeader>
        <SheetClose
          render={<Button variant="ghost" size="icon" aria-label={t(keys.nav.close)} />}
          className="absolute top-3 right-3"
        >
          <CloseIcon />
        </SheetClose>

        <div className="flex flex-1 flex-col overflow-y-auto p-3">
          <nav className="flex flex-col gap-1" aria-label={t(keys.nav.sparring)}>
            <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-widest text-text-lo uppercase">
              {t(keys.nav.sparring)}
            </p>
            <NavigationLink
              render={<Link to={sparringPath} onClick={() => setOpen(false)} />}
              state={isNewMatchRoute ? 'active' : 'default'}
              indicator="short"
            >
              {t(keys.nav.newMatch)}
            </NavigationLink>
            <NavigationLink
              render={
                <Link to={localizedPath('/sparring/matches/', currentLocale)} onClick={() => setOpen(false)} />
              }
              state={isMatchesRoute ? 'active' : 'default'}
              indicator="short"
            >
              {t(keys.nav.allMatches)}
            </NavigationLink>
          </nav>

          <Separator className="my-4" />

          <section className="flex flex-col gap-3 px-3" aria-labelledby="theme-options-label">
            <p
              id="theme-options-label"
              className="text-xs font-semibold tracking-widest text-text-lo uppercase"
            >
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

          <Separator className="my-4" />

          <section className="flex flex-col gap-3 px-3" aria-labelledby="locale-options-label">
            <p
              id="locale-options-label"
              className="text-xs font-semibold tracking-widest text-text-lo uppercase"
            >
              {t(keys.language.section)}
            </p>
            <div className="flex gap-2">
              {LOCALE_OPTIONS.map(({ value, labelKey }) => (
                <Button
                  key={value}
                  nativeButton={false}
                  render={
                    <Link
                      reloadDocument
                      to={pathForLocale(location.pathname, location.search, location.hash, value)}
                    />
                  }
                  size="sm"
                  variant={currentLocale === value ? 'primary' : 'outline'}
                >
                  {t(labelKey)}
                </Button>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
