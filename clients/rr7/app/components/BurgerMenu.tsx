import { Button, Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@ks/ui'
import { useFetcher, Link } from 'react-router'

import { useRootTheme } from '../root'
import type { AppTheme } from '../server/theme'

const THEME_OPTIONS: { value: AppTheme; label: string }[] = [
  { value: 'club-dark', label: 'Темна' },
  { value: 'club-light', label: 'Світла' },
  { value: 'auto', label: 'Авто' },
]

export function BurgerMenu() {
  const currentTheme = useRootTheme()
  const fetcher = useFetcher()

  function changeTheme(theme: AppTheme) {
    fetcher.submit({ theme }, { method: 'post', action: '/api/theme' })
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          aria-label="Menu"
          className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-black/10 active:bg-black/20"
        >
          <HamburgerIcon />
        </button>
      </SheetTrigger>

      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Play and Keep Score</SheetTitle>
          <SheetClose asChild>
            <button
              aria-label="Закрити"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-overlay"
            >
              <CloseIcon />
            </button>
          </SheetClose>
        </SheetHeader>

        <nav className="flex flex-col gap-1 py-4">
          <p className="text-xs font-semibold tracking-widest text-text-ghost uppercase">Навігація</p>
          <SheetClose asChild>
            <Link
              to="/sparring"
              className="py-2.5 text-sm font-medium text-text-hi underline-offset-4 hover:underline"
            >
              Спаринг
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              to="/sparring/matches"
              className="py-2.5 text-sm font-medium text-text-hi underline-offset-4 hover:underline"
            >
              Останні матчі
            </Link>
          </SheetClose>
        </nav>

        <div className="border-t border-divider py-4">
          <p className="mb-3 text-xs font-semibold tracking-widest text-text-ghost uppercase">Тема</p>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label }) => (
              <Button
                key={value}
                size="sm"
                variant={currentTheme === value ? 'default' : 'outline'}
                onClick={() => changeTheme(value)}
              >
                {label}
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
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="5" width="16" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="2" y="9.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="2" y="13.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
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
