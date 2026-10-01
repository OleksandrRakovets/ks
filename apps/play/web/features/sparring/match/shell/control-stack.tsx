import type { Control, ControlSections, MatchCommand } from '@ks/core'
import type { ReactNode } from 'react'

import { type ControlPresentation, presentControls } from '../renderers/control-presentation'
import { ControlZones, type ZonePresentation } from './control-zones'
import { Takeover, TakeoverContainer } from './takeover'

export type { ControlPresentation } from '../renderers/control-presentation'

export function ControlStack(props: {
  sections: ControlSections
  selector?: ReactNode
  takeover?: ReactNode
  renderControl: (control: Control, index: number) => ControlPresentation
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  if (props.takeover !== undefined && props.takeover !== null) {
    return <TakeoverContainer>{props.takeover}</TakeoverContainer>
  }

  if (props.sections.neutral.length > 0) {
    return (
      <TakeoverContainer>
        <Takeover
          controls={presentControls(
            props.sections.neutral,
            props.renderControl,
            props.submitting,
            props.onSubmit,
          )}
        />
      </TakeoverContainer>
    )
  }

  return (
    <ControlZones
      selector={props.selector}
      primary={presentZone(props.sections.primary, props)}
      secondary={presentZone(props.sections.secondary, props)}
    />
  )
}

function presentZone(
  controls: ControlSections['primary'],
  props: Parameters<typeof ControlStack>[0],
): ZonePresentation | null {
  if (controls.A.length === 0 && controls.B.length === 0) return null

  function lane(controls: readonly Control[]) {
    const items = presentControls(controls, props.renderControl, props.submitting, props.onSubmit)

    return { items, compact: items.length > 1 && items.every((item) => item.visibleLabel.length <= 3) }
  }

  return { A: lane(controls.A), B: lane(controls.B) }
}
