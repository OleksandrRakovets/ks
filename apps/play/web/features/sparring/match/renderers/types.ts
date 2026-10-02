import {
  type Control,
  type ControlSections,
  type HydratedMatchParticipants,
  type MatchCommand,
  newCommandId,
} from '@ks/core'

export type MatchControlRendererProps<Presentation> = {
  readonly game: Presentation
  readonly controls: readonly (typeof Control.Type)[]
  readonly sections: typeof ControlSections.Type
  readonly participants: typeof HydratedMatchParticipants.Type
  readonly onSubmitCommand: (command: typeof MatchCommand.Type) => void
  readonly submitting: boolean
}

export function matchCommandFromControl(
  control: typeof Control.Type,
  input: (typeof Control.Type)['fixedInput'] = {},
): typeof MatchCommand.Type {
  const command = { type: control.type, ...control.fixedInput, ...input }

  return {
    commandId: newCommandId(),
    source: control.source,
    command: control.seat === undefined ? command : { ...command, seat: control.seat },
  }
}
