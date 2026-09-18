import { Popover } from '@base-ui/react/popover'
import { keys } from '@ks/i18n'
import type { SupportedLocale } from '@ks/i18n'
import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher, useLocation } from 'react-router'

import { localizedPath, pathForLocale } from '../locale'
import { useRootLocale, useRootTheme } from '../root'
import type { AppTheme } from '../server/theme'
import {
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  ToggleGroup,
  ToggleGroupItem,
  useBottomSheetDrag,
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

export function BurgerMenu({ placement }: { placement?: 'header' | 'navigation' }) {
  const [open, setOpen] = useState(false)
  const currentLocale = useRootLocale()
  const currentTheme = useRootTheme()
  const fetcher = useFetcher()
  const location = useLocation()
  const { t } = useTranslation()
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false)

  const {
    close: closeMobileSheet,
    handleProps: mobileSheetHandleProps,
    popupRef: mobileSheetPopupRef,
  } = useBottomSheetDrag({ enabled: !desktop, onDismiss: () => setOpen(false) })

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

  function closeMenu() {
    if (desktop) setOpen(false)
    else closeMobileSheet()
  }

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setOpen(true)
    else closeMenu()
  }

  const content = (
    <>
      {desktop ? (
        <>
          <Popover.Title className="sr-only">{t(keys.nav.menu)}</Popover.Title>
          <Popover.Close
            aria-label={t(keys.nav.close)}
            className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span aria-hidden="true" className="text-2xl">
              ×
            </span>
          </Popover.Close>
        </>
      ) : (
        <>
          <SheetTitle className="sr-only">{t(keys.nav.menu)}</SheetTitle>
          <button
            type="button"
            aria-label={t(keys.nav.close)}
            className="mx-auto flex h-11 w-16 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
            {...mobileSheetHandleProps}
          >
            <span className="h-1 w-10 rounded-full bg-border" />
          </button>
        </>
      )}

      <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-5 md:pt-4">
        <nav className="flex flex-col gap-1" aria-label={t(keys.nav.sparring)}>
          <h2 className="px-3 py-1 text-base font-semibold">{t(keys.nav.sparring)}</h2>
          <Link
            to={sparringPath}
            onClick={closeMenu}
            aria-current={isNewMatchRoute ? 'page' : undefined}
            className="flex min-h-12 items-center rounded-md px-3 text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
          >
            {t(keys.nav.newGame)}
          </Link>
          <Link
            to={localizedPath('/sparring/matches/', currentLocale)}
            onClick={closeMenu}
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
    </>
  )

  if (desktop) {
    return (
      <Popover.Root open={open} onOpenChange={changeOpen}>
        <Popover.Trigger
          render={<Button variant="ghost" size="icon" aria-label={t(keys.nav.menu)} />}
          className="size-11 active:translate-y-0"
        >
          <HamburgerIcon />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={16}>
            <Popover.Popup className="relative flex max-h-[var(--available-height)] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl transition-opacity duration-150 outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none">
              {content}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    )
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label={t(keys.nav.menu)} />}
        className={
          placement === 'navigation' ? 'active:translate-y-0 lg:mr-2' : 'size-11 active:translate-y-0'
        }
      >
        <HamburgerIcon />
      </SheetTrigger>
      <SheetContent ref={mobileSheetPopupRef} side="bottom" className="motion-reduce:transition-none">
        {content}
      </SheetContent>
    </Sheet>
  )
}

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia('(min-width: 768px)')
  query.addEventListener('change', onChange)

  return () => query.removeEventListener('change', onChange)
}

function isDesktop() {
  return window.matchMedia('(min-width: 768px)').matches
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
