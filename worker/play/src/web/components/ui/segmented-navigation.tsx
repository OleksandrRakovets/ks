import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import * as React from 'react'

import { cn } from '@/components/ui/utils'

/**
 * Route-navigation counterpart to `ToggleGroup`. Its visual treatment originates in that component
 * and should evolve alongside it, but its links deliberately retain native navigation semantics and
 * identify the current route with `aria-current` rather than a toggle's pressed-button state.
 */
function SegmentedNavigation({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot="segmented-navigation"
      className={cn('inline-flex w-fit rounded-md border border-border bg-background p-1', className)}
      {...props}
    />
  )
}

function SegmentedNavigationLink({
  active = false,
  className,
  render,
  ...props
}: useRender.ComponentProps<'a'> & { active?: boolean }) {
  return useRender({
    defaultTagName: 'a',
    render,
    props: mergeProps(
      {
        'aria-current': active ? ('page' as const) : undefined,
        className: cn(
          'inline-flex h-9 items-center justify-center rounded-sm px-3 text-base font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
          active && 'bg-secondary text-secondary-foreground',
          className,
        ),
      },
      props,
    ),
    state: { active, slot: 'segmented-navigation-link' },
  })
}

export { SegmentedNavigation, SegmentedNavigationLink }
