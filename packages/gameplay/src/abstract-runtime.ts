import { ControlCommandPresetSchema, type BySeatNumber, type FrameOutcome } from '@ks/core'
import { z } from 'zod'

export const GameProjectionKeySchema = z.enum(['control', 'scoreboard', 'summary'])
export type GameProjectionKey = z.infer<typeof GameProjectionKeySchema>

export const GameScoreSchema = z.object({
  A: z.number().int(),
  B: z.number().int(),
})

export const GameCommandPresetSchema = ControlCommandPresetSchema.extend({ source: z.literal('game') })

export const GameControlProjectionSchema = z.object({
  gameKey: z.string().min(1),
  projection: z.literal('control'),
  score: GameScoreSchema,
  details: z.unknown().optional(),
})

export const GameScoreboardProjectionSchema = z.object({
  gameKey: z.string().min(1),
  projection: z.literal('scoreboard'),
  score: GameScoreSchema,
  details: z.unknown().optional(),
})

export const GameSummaryProjectionSchema = z.object({
  gameKey: z.string().min(1),
  projection: z.literal('summary'),
  score: GameScoreSchema,
  details: z.unknown().optional(),
})

export type GameCommandEnvelope = {
  commandType: string
  command: unknown
}

export type GameCommandResult = {
  state: unknown
  outcome?: FrameOutcome
  protocolEntries?: unknown[]
}

export type GameCreateStateArgs = {
  targetPointsBySeat: BySeatNumber
}

export abstract class GameplayRuntime {
  abstract createInitialState(args: GameCreateStateArgs): unknown
  abstract parseState(state: unknown): unknown
  abstract applyCommand(args: { state: unknown; commandType: string; command: unknown }): GameCommandResult
  abstract deriveProjection(args: { state: unknown; projection: GameProjectionKey }): unknown
}
