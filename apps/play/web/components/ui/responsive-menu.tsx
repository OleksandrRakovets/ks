import { Popover } from '@base-ui/react/popover'
import { type ReactElement, type ReactNode, useState, useSyncExternalStore } from 'react'

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet'
import { useBottomSheetDrag } from './use-bottom-sheet-drag'

type ResponsiveMenuProps = {
  title: string
  closeLabel: string
  trigger: ReactElement
  children: (controls: { close: () => void }) => ReactNode
}

/**
 * Presents compact menu content as an anchored popover on desktop and a draggable bottom sheet on
 * smaller viewports. This component owns the responsive chrome and dismissal behavior; callers own
 * only the trigger and menu content.
 */
export function ResponsiveMenu({ title, closeLabel, trigger, children }: ResponsiveMenuProps) {
  const [open, setOpen] = useState(false)
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false)

  const {
    close: closeMobileSheet,
    handleProps: mobileSheetHandleProps,
    popupRef: mobileSheetPopupRef,
  } = useBottomSheetDrag({ enabled: !desktop, onDismiss: () => setOpen(false) })

  function close() {
    if (desktop) setOpen(false)
    else closeMobileSheet()
  }

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setOpen(true)
    else close()
  }

  const content = children({ close })

  if (desktop) {
    return (
      <Popover.Root open={open} onOpenChange={changeOpen}>
        <Popover.Trigger render={trigger} />
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={16}>
            <Popover.Popup className="relative flex max-h-[var(--available-height)] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl transition-opacity duration-150 outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none">
              <Popover.Title className="sr-only">{title}</Popover.Title>
              <Popover.Close
                aria-label={closeLabel}
                className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span aria-hidden="true" className="text-2xl">
                  ×
                </span>
              </Popover.Close>
              {content}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    )
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent ref={mobileSheetPopupRef} side="bottom" className="motion-reduce:transition-none">
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <button
          type="button"
          aria-label={closeLabel}
          className="mx-auto flex h-11 w-16 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
          {...mobileSheetHandleProps}
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </button>
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
