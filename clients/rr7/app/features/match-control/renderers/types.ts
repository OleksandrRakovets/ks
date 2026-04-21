import type { MatchSnapshot } from '@ks/core'

export type GameControlProjection = {
  gameKey: string
  projection: 'control'
  score: { A: number; B: number }
  availableCommands: Array<{
    commandType: string
    command: Record<string, unknown>
    label?: string
    effectSummary?: string
    warning?: string
    helpText?: string
    primary?: boolean
    secondary?: boolean
  }>
  details?: unknown
}

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
