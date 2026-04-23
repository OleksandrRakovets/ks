import * as React from 'react'

import { cn } from '../lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-divider bg-raised px-2.5 py-1 text-sm text-text-hi transition-colors outline-none placeholder:text-text-ghost focus-visible:border-green focus-visible:ring-2 focus-visible:ring-green/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red aria-invalid:ring-2 aria-invalid:ring-red/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
