import { keys } from '@ks/i18n'
import type { SupportedLocale } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher, useLocation } from 'react-router'

import { localizedPath, pathForLocale } from '../locale'
import { useRootLocale, useRootTheme } from '../root'
import type { AppTheme } from '../server/theme'
import { BrandWordmark } from './BrandWordmark'
import { Button, Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui'

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
  const currentLocale = useRootLocale()
  const currentTheme = useRootTheme()
  const fetcher = useFetcher()
  const location = useLocation()
  const { t } = useTranslation()

  function changeTheme(theme: AppTheme) {
    fetcher.submit({ theme }, { method: 'post', action: '/ui-preferences/theme/' })
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t(keys.nav.menu)}
          className={
            props.placement === 'navigation'
              ? 'relative -mt-px flex h-12 w-full items-center justify-center border-t-2 border-transparent text-base font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset lg:h-14'
              : 'flex h-14 items-center justify-center px-4 text-green outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset'
          }
        >
          <span className={props.placement === 'navigation' ? 'absolute left-4 lg:left-2' : undefined}>
            <HamburgerIcon />
          </span>
          {props.placement === 'navigation' ? <span>{t(keys.nav.menu)}</span> : null}
        </button>
      </SheetTrigger>

      <SheetContent aria-describedby={undefined}>
        <SheetHeader className="h-20 pl-4">
          <SheetTitle className="sr-only">{t(keys.appTitle)}</SheetTitle>
          <BrandWordmark className="h-12" title={t(keys.appTitle)} />
          <SheetClose asChild>
            <button
              type="button"
              aria-label={t(keys.nav.close)}
              className="grid size-14 shrink-0 place-items-center self-start text-text-ghost outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <CloseIcon />
            </button>
          </SheetClose>
        </SheetHeader>

        <nav className="flex flex-col gap-1 px-4 py-4">
          <p className="text-xs font-semibold tracking-widest text-text-ghost uppercase">
            {t(keys.nav.sparring)}
          </p>
          <SheetClose asChild>
            <Link
              to={localizedPath('/sparring/', currentLocale)}
              className="py-2.5 text-sm font-medium text-text-hi underline-offset-4 hover:underline"
            >
              {t(keys.nav.newMatch)}
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              to={localizedPath('/sparring/matches/', currentLocale)}
              className="py-2.5 text-sm font-medium text-text-hi underline-offset-4 hover:underline"
            >
              {t(keys.nav.allMatches)}
            </Link>
          </SheetClose>
        </nav>

        <div className="px-4 pt-4">
          <p className="mb-3 text-xs font-semibold tracking-widest text-text-ghost uppercase">
            {t(keys.theme.section)}
          </p>
          <div className="flex gap-3">
            {THEME_OPTIONS.map(({ value, labelKey }) => (
              <Button
                key={value}
                size="sm"
                variant={currentTheme === value ? 'default' : 'outline'}
                onClick={() => changeTheme(value)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-4">
          <p className="mt-5 mb-3 text-xs font-semibold tracking-widest text-text-ghost uppercase">
            {t(keys.language.section)}
          </p>
          <div className="flex gap-3">
            {LOCALE_OPTIONS.map(({ value, labelKey }) => (
              <Button key={value} asChild size="sm" variant={currentLocale === value ? 'default' : 'outline'}>
                <Link
                  reloadDocument
                  to={pathForLocale(location.pathname, location.search, location.hash, value)}
                >
                  {t(labelKey)}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function HamburgerIcon() {
  return (
    <svg width="22" height="17" viewBox="0 0 16 12" fill="none" aria-hidden>
      <path d="M0 1h16M0 6h16M0 11h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
