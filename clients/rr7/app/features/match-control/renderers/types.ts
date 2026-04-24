import type { MatchSnapshot } from '@ks/core'
import { GameControlProjectionSchema } from '@ks/gameplay'
import type { z } from 'zod'

export type GameControlProjection = z.infer<typeof GameControlProjectionSchema>

export type HydratedMatchParticipants = {
  A: { playerRef: string; displayName: string; shortDisplayName: string }
  B: { playerRef: string; displayName: string; shortDisplayName: string }
}

export type MatchControlRendererProps = {
  projection: GameControlProjection
  snapshot: MatchSnapshot
  participants: HydratedMatchParticipants
  onSubmitCommand: (args: { commandType: string; command: Record<string, unknown> }) => void
  submitting: boolean
}
