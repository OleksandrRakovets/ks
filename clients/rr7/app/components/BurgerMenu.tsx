import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@ks/ui'
import { useFetcher, Link } from 'react-router'

import { useRootTheme } from '../root'
import type { AppTheme } from '../server/theme'

const THEME_OPTIONS: { value: AppTheme; label: string }[] = [
  { value: 'dark', label: 'Темна' },
  { value: 'light', label: 'Світла' },
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
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted"
            >
              <CloseIcon />
            </button>
          </SheetClose>
        </SheetHeader>

        <nav className="flex flex-col gap-1 p-4">
          <SheetClose asChild>
            <Link to="/sparring" className="rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
              Спаринг
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              to="/sparring/matches"
              className="rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Останні матчі
            </Link>
          </SheetClose>
        </nav>

        <div className="border-t border-border p-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Тема</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {THEME_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => changeTheme(value)}
                className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  currentTheme === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
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
