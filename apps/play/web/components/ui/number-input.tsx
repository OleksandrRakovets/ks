import * as React from 'react'

import { Input } from './form'

function NumberInput({ onFocus, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <Input
      type="number"
      data-slot="number-input"
      onFocus={(event) => {
        event.currentTarget.select()
        onFocus?.(event)
      }}
      {...props}
    />
  )
}

export { NumberInput }
