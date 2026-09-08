import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './utils'

const badgeVariants = cva(
  'inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-xs font-semibold tracking-wide',
  {
    variants: {
      variant: {
        live: 'border-primary/25 bg-primary/15 text-primary',
        neutral: 'border-border bg-muted text-text-lo',
        warning: 'border-amber/25 bg-amber-tint text-amber',
        destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

function Badge({
  className,
  variant = 'neutral',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>({ className: cn(badgeVariants({ variant }), className) }, props),
    state: { slot: 'preview-badge', variant },
  })
}

export { Badge }
