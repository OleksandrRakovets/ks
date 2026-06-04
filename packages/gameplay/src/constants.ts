import {
  BySeatNumberSchema,
  ControlCommandPresetSchema,
  type BySeatNumber,
  type FrameOutcome,
  type ProtocolEntry,
} from '@ks/core'
import { z } from 'zod'

export type GameInputMode = 'pyramid-basic' | 'strila-basic'

export type LocalizedGameTitle = {
  uk: string
  en: string
}

export type GameMeta = {
  title: LocalizedGameTitle
  inputMode: GameInputMode
  defaultFrameTargetPointsBySeat: BySeatNumber
}

export const GameProjectionKeySchema = z.enum(['control', 'scoreboard', 'summary'])
export type GameProjectionKey = z.infer<typeof GameProjectionKeySchema>

export const GameCommandPresetSchema = ControlCommandPresetSchema.extend({ source: z.literal('game') })

export const GameControlProjectionSchema = z.object({
  gameKey: z.string().min(1),
  projection: z.literal('control'),
  score: BySeatNumberSchema,
  details: z.unknown().optional(),
})

export const GameScoreboardProjectionSchema = z.object({
  gameKey: z.string().min(1),
  projection: z.literal('scoreboard'),
  score: BySeatNumberSchema,
  details: z.unknown().optional(),
})

export const GameSummaryProjectionSchema = z.object({
  gameKey: z.string().min(1),
  projection: z.literal('summary'),
  score: BySeatNumberSchema,
  details: z.unknown().optional(),
})

export type GameCommandResult = {
  state: unknown
  outcome?: FrameOutcome
  protocolEntries: ProtocolEntry[]
}

export type GameCreateStateArgs = {
  targetPointsBySeat: BySeatNumber
}

export interface GameplayRuntime {
  createInitialState(args: GameCreateStateArgs): unknown
  parseState(state: unknown): unknown
  applyCommand(args: { state: unknown; commandType: string; command: unknown }): GameCommandResult
  deriveProjection(args: { state: unknown; projection: GameProjectionKey }): unknown
}
