import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import * as React from 'react'

import { cn } from './utils'

function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="preview-toggle-group"
      className={cn('inline-flex w-fit rounded-md border border-border bg-background p-1', className)}
      {...props}
    />
  )
}

function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="preview-toggle-group-item"
      className={cn(
        'h-8 rounded-sm px-3 text-xs font-medium text-text-lo transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-pressed:bg-secondary data-pressed:text-secondary-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
