import type { ControlCommandPreset, ControlCommandSections, MatchSnapshot } from '@ks/core'
import { GameControlProjectionSchema } from '@ks/gameplay/definitions'
import type * as v from 'valibot'

export type GameControlProjection = v.InferOutput<typeof GameControlProjectionSchema>

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
