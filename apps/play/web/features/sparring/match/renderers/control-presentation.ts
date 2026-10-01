import type { Control, MatchCommand } from '@ks/core'
import type { ReactNode } from 'react'

import { matchCommandFromControl } from './types'

export type ControlPresentation = {
  label: ReactNode
  visibleLabel: string
  accessibleLabel?: string
  effect?: string
  disabled?: boolean
  input?: Control['fixedInput']
  command?: MatchCommand
}

export type PresentedControl = {
  key: string
  label: ReactNode
  visibleLabel: string
  accessibleLabel?: string
  effect?: string
  disabled: boolean
  unavailable: boolean
  destructive: boolean
  onSelect: () => void
}

export function presentControls(
  controls: readonly Control[],
  renderControl: (control: Control, index: number) => ControlPresentation,
  submitting: boolean,
  onSubmit: (command: MatchCommand) => void,
): PresentedControl[] {
  return controls.map((control, index) => {
    const presentation = renderControl(control, index)

    return {
      key: `${control.source}-${control.type}-${index}`,
      label: presentation.label,
      visibleLabel: presentation.visibleLabel,
      accessibleLabel: presentation.accessibleLabel,
      effect: presentation.effect,
      disabled: submitting || presentation.disabled === true,
      unavailable: presentation.disabled === true,
      destructive: control.type === 'foul.commit',
      // Construct at activation, not render: repeating a control must produce a fresh Command ID.
      onSelect: () => onSubmit(presentation.command ?? matchCommandFromControl(control, presentation.input)),
    }
  })
}
