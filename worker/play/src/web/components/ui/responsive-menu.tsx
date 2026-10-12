import { Drawer } from '@base-ui/react/drawer'
import { Popover } from '@base-ui/react/popover'
import { type ReactElement, type ReactNode, useState, useSyncExternalStore } from 'react'

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

  function close() {
    setOpen(false)
  }

  const content = children({ close })

  if (desktop) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
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
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="down">
      <Drawer.Trigger render={trigger} />
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black opacity-[calc(0.55*(1-var(--drawer-swipe-progress)))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute motion-reduce:transition-none" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Extend the panel's background below its edge, as in Base UI's bottom-sheet demo. */}
          <Drawer.Popup
            data-slot="drawer-content"
            className="-mb-12 flex max-h-[calc(100dvh-1rem+3rem)] w-full [transform:translateY(var(--drawer-swipe-movement-y))] flex-col rounded-t-2xl border-t border-border bg-card pb-[calc(3rem+env(safe-area-inset-bottom,0px))] text-card-foreground shadow-2xl transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none data-ending-style:[transform:translateY(calc(100%-3rem+2px))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:[transform:translateY(calc(100%-3rem+2px))] data-swiping:duration-0 motion-reduce:transition-none"
          >
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            <Drawer.Close
              aria-label={closeLabel}
              className="mx-auto flex h-11 w-16 shrink-0 cursor-grab items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
            >
              <span className="h-1 w-10 rounded-full bg-border" />
            </Drawer.Close>
            <Drawer.Content className="flex min-h-0 flex-col">{content}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
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
