import { Input as InputPrimitive } from '@base-ui/react/input'
import * as React from 'react'

import { cn } from './utils'

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="preview-field-group" className={cn('flex flex-col gap-5', className)} {...props} />
}

function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="preview-field"
      className={cn('group/field flex flex-col gap-2 data-[invalid=true]:text-destructive', className)}
      {...props}
    />
  )
}

/* oxlint-disable jsx-a11y/label-has-associated-control -- consumers provide the control id via htmlFor */
function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      className={cn('text-sm font-medium group-data-[disabled=true]/field:opacity-50', className)}
      {...props}
    />
  )
}
/* oxlint-enable jsx-a11y/label-has-associated-control */

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs leading-relaxed text-text-lo', className)} {...props} />
}

const controlClasses =
  'w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-destructive/20'

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive data-slot="preview-input" className={cn(controlClasses, 'h-10', className)} {...props} />
  )
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="preview-textarea"
      className={cn(controlClasses, 'field-sizing-content min-h-24 py-2.5', className)}
      {...props}
    />
  )
}

export { Field, FieldDescription, FieldGroup, FieldLabel, Input, Textarea }
