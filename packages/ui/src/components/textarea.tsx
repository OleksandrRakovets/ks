import * as React from 'react'

import { cn } from '../lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-divider bg-raised px-2.5 py-2 text-base text-text-hi transition-colors outline-none placeholder:text-text-ghost focus-visible:border-green focus-visible:ring-2 focus-visible:ring-green/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red aria-invalid:ring-2 aria-invalid:ring-red/20',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
