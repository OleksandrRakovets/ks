import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-md border border-transparent font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/85',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/75',
        outline: 'border-border bg-transparent text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        destructive: 'bg-destructive/15 text-destructive hover:bg-destructive/25',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        md: 'h-10 gap-2 px-4 text-sm',
        touch: 'h-12 gap-2 px-5 text-base',
        icon: 'size-10 text-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="preview-button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button }
