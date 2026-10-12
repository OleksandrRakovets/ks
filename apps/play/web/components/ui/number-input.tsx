import * as React from 'react'

import { Input } from '@/components/ui/form'

function NumberInput({ onFocus, onClick, onInput, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <Input
      type="number"
      data-slot="number-input"
      onInput={(event) => {
        const input = event.currentTarget

        if (input.validity.rangeUnderflow || input.validity.rangeOverflow) input.value = ''
        onInput?.(event)
      }}
      onFocus={(event) => {
        event.currentTarget.select()
        onFocus?.(event)
      }}
      onClick={(event) => {
        event.currentTarget.select()
        onClick?.(event)
      }}
      {...props}
    />
  )
}

export { NumberInput }
