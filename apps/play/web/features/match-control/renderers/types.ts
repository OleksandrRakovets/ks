import type { HydratedMatchParticipants } from '@ks/application'
import { type Control, type ControlSections, type MatchCommand, type MatchState, newCommandId } from '@ks/core'

export type MatchControlRendererProps<Projection> = {
  projection: Projection
  controlSections: ControlSections
  state: MatchState
  participants: HydratedMatchParticipants
  onSubmitCommand: (command: MatchCommand) => void
  submitting: boolean
}

export function matchCommandFromControl(control: Control, input: Control['fixedInput'] = {}): MatchCommand {
  const command: MatchCommand['command'] = { type: control.type, ...control.fixedInput, ...input }
  if (control.seat !== undefined) command.seat = control.seat
  return {
    commandId: newCommandId(),
    source: control.source,
    command,
  }
}
