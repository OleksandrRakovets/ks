import { Dialog } from 'radix-ui'
import * as React from 'react'

import { cn } from './utils'

function Sheet({ ...props }: React.ComponentProps<typeof Dialog.Root>) {
  return <Dialog.Root {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof Dialog.Close>) {
  return <Dialog.Close {...props} />
}

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof Dialog.Content>) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-72 flex-col rounded-none bg-card shadow-2xl',
          'duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in',
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          className,
        )}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  )
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex h-11 items-center justify-between pl-4', className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof Dialog.Title>) {
  return <Dialog.Title className={cn('text-sm font-bold text-primary', className)} {...props} />
}

export { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger }
