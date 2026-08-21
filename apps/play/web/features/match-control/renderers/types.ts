import type { HydratedMatchParticipants } from '@ks/application'
import type { ControlCommandPreset, ControlCommandSections, MatchSnapshot } from '@ks/core'

export type MatchControlRendererProps<Projection> = {
  projection: Projection
  commandSections: ControlCommandSections
  snapshot: MatchSnapshot
  participants: HydratedMatchParticipants
  onSubmitCommand: (command: ControlCommandPreset) => void
  submitting: boolean
}
