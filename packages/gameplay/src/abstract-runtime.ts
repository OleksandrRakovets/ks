import { z } from 'zod'

export const GameProjectionKeySchema = z.enum(['control', 'scoreboard', 'summary'])
export type GameProjectionKey = z.infer<typeof GameProjectionKeySchema>

export const GameScoreSchema = z.object({
  A: z.number().int(),
  B: z.number().int(),
})

export const GameCommandPresetSchema = z.object({
  commandType: z.string().min(1),
  command: z.record(z.string(), z.unknown()),
  label: z.string().min(1).optional(),
  effectSummary: z.string().min(1).optional(),
  warning: z.string().min(1).optional(),
  helpText: z.string().min(1).optional(),
})

export const GameControlProjectionSchema = z.object({
  gameKey: z.string().min(1),
  projection: z.literal('control'),
  score: GameScoreSchema,
  availableCommands: z.array(GameCommandPresetSchema),
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
  protocolEntries?: unknown[]
}

export type GameCreateStateArgs = {
  targetPointsBySeat: { A: number; B: number }
}

export abstract class GameplayRuntime {
  abstract createInitialState(args: GameCreateStateArgs): unknown
  abstract parseState(state: unknown): unknown
  abstract applyCommand(args: { state: unknown; commandType: string; command: unknown }): GameCommandResult
  abstract deriveProjection(args: { state: unknown; projection: GameProjectionKey }): unknown
}
