import type { ControlCommandPreset, ControlCommandSections, MatchSnapshot } from '@ks/core'
import type { GameControlProjection } from '@ks/gameplay/definitions'

export type HydratedMatchParticipants = {
  A: { playerRef: string; displayName: string; shortDisplayName: string }
  B: { playerRef: string; displayName: string; shortDisplayName: string }
}

export type MatchControlRendererProps = {
  projection: GameControlProjection
  commandSections: ControlCommandSections
  snapshot: MatchSnapshot
  participants: HydratedMatchParticipants
  onSubmitCommand: (command: ControlCommandPreset) => void
  submitting: boolean
}
