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
    'inset-y-0 right-0 w-[min(22rem,calc(100%-2rem))] border-l data-ending-style:translate-x-8 data-starting-style:translate-x-8',
  bottom:
    'inset-x-0 bottom-0 max-h-[calc(100dvh-1rem)] w-full rounded-t-2xl border-t data-ending-style:translate-y-full data-starting-style:translate-y-8',
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: SheetPrimitive.Popup.Props & { side?: keyof typeof sheetSideClasses }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/55 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col border-border bg-card text-card-foreground shadow-2xl transition duration-200 ease-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0',
          sheetSideClasses[side],
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Popup>
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
