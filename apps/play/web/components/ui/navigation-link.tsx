import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './utils'

const navigationLinkVariants = cva(
  'relative flex min-h-12 items-center rounded-sm px-3 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 lg:min-h-14 lg:px-5',
  {
    variants: {
      state: {
        default: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        active:
          'bg-primary/10 text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary',
        disabled: 'cursor-not-allowed text-muted-foreground opacity-60',
      },
      indicator: {
        wide: '',
        short: 'after:right-auto after:left-3 after:w-10',
      },
    },
    defaultVariants: { state: 'default', indicator: 'wide' },
  },
)

function NavigationLink({
  className,
  indicator = 'wide',
  render,
  state = 'default',
  ...props
}: useRender.ComponentProps<'a'> & VariantProps<typeof navigationLinkVariants>) {
  return useRender({
    defaultTagName: state === 'disabled' ? 'span' : 'a',
    render: state === 'disabled' ? undefined : render,
    props: mergeProps(
      {
        'aria-current': state === 'active' ? ('page' as const) : undefined,
        'aria-disabled': state === 'disabled' ? true : undefined,
        className: cn(navigationLinkVariants({ state, indicator }), className),
      },
      props,
    ),
    state: { slot: 'navigation-link', state },
  })
}

export { NavigationLink }
