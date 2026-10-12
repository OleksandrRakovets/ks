import type { HydratedMatchParticipants } from '@ks/application'
import { type Control, type ControlSections, type MatchCommand, newCommandId } from '@ks/core'

export type MatchControlRendererProps<Presentation> = {
  readonly game: Presentation
  readonly controls: readonly Control[]
  readonly sections: ControlSections
  readonly participants: HydratedMatchParticipants
  readonly onSubmitCommand: (command: MatchCommand) => void
  readonly submitting: boolean
}

export function matchCommandFromControl(control: Control, input: Control['fixedInput'] = {}): MatchCommand {
  const command = { type: control.type, ...control.fixedInput, ...input }

  return {
    commandId: newCommandId(),
    source: control.source,
    command: control.seat === undefined ? command : { ...command, seat: control.seat },
  }
}
