import type { HydratedMatchParticipants } from '@ks/application'
import type { MatchState } from '@ks/competition/definitions'
import { type Control, type MatchCommand, newCommandId } from '@ks/core'

export type MatchControlRendererProps<Presentation> = {
  readonly game: Presentation
  readonly controls: readonly Control[]
  readonly state: MatchState
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
