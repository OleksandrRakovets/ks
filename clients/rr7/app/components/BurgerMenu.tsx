import { keys } from '@ks/i18n'
import { Button, Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@ks/ui'
import { useTranslation } from 'react-i18next'
import { useFetcher, Link } from 'react-router'

import { useRootTheme } from '../root'
import type { AppTheme } from '../server/theme'

const THEME_OPTIONS: { value: AppTheme; labelKey: string }[] = [
  { value: 'club-dark', labelKey: keys.theme.dark },
  { value: 'club-light', labelKey: keys.theme.light },
  { value: 'auto', labelKey: keys.theme.auto },
]

export function BurgerMenu() {
  const currentTheme = useRootTheme()
  const fetcher = useFetcher()
  const { t } = useTranslation()

  function changeTheme(theme: AppTheme) {
    fetcher.submit({ theme }, { method: 'post', action: '/api/theme' })
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button aria-label={t(keys.nav.menu)} className="flex h-11 items-center justify-center px-4 text-green">
          <HamburgerIcon />
        </button>
      </SheetTrigger>

      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Play! (and Keep Score)</SheetTitle>
          <SheetClose asChild>
            <button
              aria-label={t(keys.nav.close)}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-overlay"
            >
              <CloseIcon />
            </button>
          </SheetClose>
        </SheetHeader>

        <nav className="flex flex-col gap-1 px-4 py-4">
          <p className="text-xs font-semibold tracking-widest text-text-ghost uppercase">{t(keys.nav.section)}</p>
          <SheetClose asChild>
            <Link to="/sparring" className="py-2.5 text-sm font-medium text-text-hi underline-offset-4 hover:underline">
              {t(keys.nav.sparring)}
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link to="/sparring/matches" className="py-2.5 text-sm font-medium text-text-hi underline-offset-4 hover:underline">
              {t(keys.nav.recentMatches)}
            </Link>
          </SheetClose>
        </nav>

        <div className="border-t border-divider px-4 py-4">
          <p className="mb-3 text-xs font-semibold tracking-widest text-text-ghost uppercase">{t(keys.theme.section)}</p>
          <div className="flex gap-2">
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
      </SheetContent>
    </Sheet>
  )
}

function HamburgerIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden>
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
