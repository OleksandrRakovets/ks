import * as React from 'react'

import { cn } from '../lib/utils'

function NumberInput({ className, onFocus, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="number"
      data-slot="number-input"
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-divider bg-raised px-2.5 py-1 text-base text-text-hi transition-colors outline-none placeholder:text-text-ghost focus-visible:border-green focus-visible:ring-2 focus-visible:ring-green/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red aria-invalid:ring-2 aria-invalid:ring-red/20',
        className,
      )}
      onFocus={(event) => {
        event.currentTarget.select()
        onFocus?.(event)
      }}
      {...props}
    />
  )
}

export { NumberInput }
