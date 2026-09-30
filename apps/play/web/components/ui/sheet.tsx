import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'
import * as React from 'react'

import { cn } from './utils'

function Sheet(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

const sheetSideClasses = {
  right:
    'inset-y-[8vh] right-[8vw] w-[min(22rem,calc(100vw-2rem))] border-l data-ending-style:translate-x-8 data-starting-style:translate-x-8',
  bottom:
    'inset-x-[8vw] bottom-[8vh] max-h-[calc(100dvh-1rem)] rounded-t-2xl border-t data-ending-style:translate-y-full data-starting-style:translate-y-8',
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: SheetPrimitive.Popup.Props & { side?: keyof typeof sheetSideClasses }) {
  return (
    <SheetPrimitive.Portal>
      {/*
        Safari samples viewport-edge fixed layers to tint its browser chrome. Keep both the
        backdrop and panel inside transparent oversized fixed containers so neither becomes an
        edge-color source; their visible surfaces retain the same viewport alignment.
      */}
      <SheetPrimitive.Backdrop className="fixed -inset-x-[8vw] -inset-y-[8vh] z-50 transition-opacity duration-200 before:absolute before:inset-0 before:bg-black/55 before:content-[''] data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <div className="pointer-events-none fixed -inset-x-[8vw] -inset-y-[8vh] z-50">
        <SheetPrimitive.Popup
          data-slot="sheet-content"
          className={cn(
            'pointer-events-auto absolute flex flex-col border-border bg-card text-card-foreground shadow-2xl transition duration-200 ease-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0',
            sheetSideClasses[side],
            className,
          )}
          {...props}
        >
          {children}
        </SheetPrimitive.Popup>
      </div>
    </SheetPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header className={cn('flex flex-col gap-1 border-b border-border p-5 pr-16', className)} {...props} />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title className={cn('text-base font-semibold', className)} {...props} />
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      className={cn('text-base leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger }
