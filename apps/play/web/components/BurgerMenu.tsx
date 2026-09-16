import { Popover } from '@base-ui/react/popover'
import { keys } from '@ks/i18n'
import type { SupportedLocale } from '@ks/i18n'
import { type PointerEvent as ReactPointerEvent, useRef, useState, useSyncExternalStore } from 'react'
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
  const mobileSheetRef = useRef<HTMLDivElement>(null)

  const mobileDragRef = useRef<{
    lastY: number
    pointerId: number
    startTime: number
    startY: number
  } | null>(null)

  const suppressHandleClickRef = useRef(false)
  const currentLocale = useRootLocale()
  const currentTheme = useRootTheme()
  const fetcher = useFetcher()
  const location = useLocation()
  const { t } = useTranslation()
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false)
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

  function beginMobileDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary) return

    const popup = mobileSheetRef.current

    mobileDragRef.current = {
      lastY: event.clientY,
      pointerId: event.pointerId,
      startTime: event.timeStamp,
      startY: event.clientY,
    }
    suppressHandleClickRef.current = false

    if (popup) popup.style.transition = 'none'
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveMobileDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = mobileDragRef.current
    const popup = mobileSheetRef.current

    if (!drag || drag.pointerId !== event.pointerId || !popup) return

    drag.lastY = event.clientY
    const offset = Math.max(0, event.clientY - drag.startY)
    suppressHandleClickRef.current ||= offset > 4
    popup.style.translate = `0 ${offset}px`
  }

  function endMobileDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = mobileDragRef.current
    const popup = mobileSheetRef.current

    if (!drag || drag.pointerId !== event.pointerId || !popup) return

    mobileDragRef.current = null
    const offset = Math.max(0, drag.lastY - drag.startY)

    if (offset <= 4) {
      popup.style.translate = ''
      popup.style.transition = ''

      return
    }

    const velocity = offset / Math.max(event.timeStamp - drag.startTime, 1)
    const dismiss = offset > Math.min(96, popup.offsetHeight * 0.2) || velocity > 0.55
    const destination = dismiss ? popup.offsetHeight : 0

    const animation = popup.animate([{ translate: `0 ${offset}px` }, { translate: `0 ${destination}px` }], {
      duration: dismiss ? 160 : 200,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'forwards',
    })

    void animation.finished
      .then(() => {
        animation.cancel()
        popup.style.translate = ''
        popup.style.transition = ''

        if (dismiss) setOpen(false)
      })
      .catch(() => undefined)
  }

  function cancelMobileDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (mobileDragRef.current?.pointerId !== event.pointerId) return

    mobileDragRef.current = null
    const popup = mobileSheetRef.current

    if (!popup) return
    const offset = popup.style.translate || '0 0'

    const animation = popup.animate([{ translate: offset }, { translate: '0 0' }], {
      duration: 200,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'forwards',
    })

    void animation.finished
      .then(() => {
        animation.cancel()
        popup.style.translate = ''
        popup.style.transition = ''
      })
      .catch(() => undefined)
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
            onClick={() => {
              if (suppressHandleClickRef.current) {
                suppressHandleClickRef.current = false

                return
              }

              setOpen(false)
            }}
            onPointerDown={beginMobileDrag}
            onPointerMove={moveMobileDrag}
            onPointerUp={endMobileDrag}
            onPointerCancel={cancelMobileDrag}
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
            onClick={() => setOpen(false)}
            aria-current={isNewMatchRoute ? 'page' : undefined}
            className="flex min-h-12 items-center rounded-md px-3 text-text-lo outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
          >
            {t(keys.nav.newGame)}
          </Link>
          <Link
            to={localizedPath('/sparring/matches/', currentLocale)}
            onClick={() => setOpen(false)}
            aria-current={isMatchesRoute ? 'page' : undefined}
            className="flex min-h-12 items-center justify-between rounded-md px-3 text-text-lo outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
          >
            <span>{t(keys.nav.matches)}</span>
            {matchCount === undefined ? null : <span className="text-text-lo tabular-nums">{matchCount}</span>}
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
      <Popover.Root open={open} onOpenChange={setOpen}>
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label={t(keys.nav.menu)} />}
        className={
          placement === 'navigation' ? 'active:translate-y-0 lg:mr-2' : 'size-11 active:translate-y-0'
        }
      >
        <HamburgerIcon />
      </SheetTrigger>
      <SheetContent
        ref={mobileSheetRef}
        className="inset-x-0 top-auto bottom-0 max-h-[calc(100dvh-1rem)] w-full rounded-t-2xl border-t border-r-0 border-b-0 border-l-0 data-ending-style:translate-x-0 data-ending-style:translate-y-8 data-starting-style:translate-x-0 data-starting-style:translate-y-8 motion-reduce:transition-none"
      >
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
