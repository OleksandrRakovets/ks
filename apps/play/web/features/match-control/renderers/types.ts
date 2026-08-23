import type { HydratedMatchParticipants } from '@ks/application'
import type { ControlCommandPreset, ControlCommandSections, MatchState } from '@ks/core'

export type MatchControlRendererProps<Projection> = {
  projection: Projection
  commandSections: ControlCommandSections
  state: MatchState
  participants: HydratedMatchParticipants
  onSubmitCommand: (command: ControlCommandPreset) => void
  submitting: boolean
}
