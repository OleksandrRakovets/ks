import {
  type BySeatNumber,
  BySeatNumberSchema,
  ControlCommandPresetSchema,
  emptyControlCommandSections,
  type FrameOutcome,
  type GameConfiguration,
  NonEmptyStringSchema,
  type ProtocolEntry,
  type Seat,
} from '@ks/core'
import * as v from 'valibot'

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

export const GameCommandPresetSchema = v.object({ ...ControlCommandPresetSchema.entries, source: v.literal('game') })

export const GameControlCommandSchema = GameCommandPresetSchema
export type GameControlCommand = v.InferOutput<typeof GameControlCommandSchema>

export function deriveGameCommandSections(commands: readonly GameControlCommand[]) {
  const sections = emptyControlCommandSections()

  for (const entry of commands) {
    if (entry.seat) sections[entry.prominence][entry.seat].push(entry)
    else sections.neutral.push(entry)
  }

  return sections
}

export const GameControlProjectionSchema = v.object({
  gameKey: NonEmptyStringSchema,
  projection: v.literal('control'),
  score: BySeatNumberSchema,
  details: v.optional(v.unknown()),
})
export type GameControlProjectionInput = v.InferOutput<typeof GameControlProjectionSchema>

export const GameScoreboardProjectionSchema = v.object({
  gameKey: NonEmptyStringSchema,
  projection: v.literal('scoreboard'),
  score: BySeatNumberSchema,
  details: v.optional(v.unknown()),
})

export const GameSummaryProjectionSchema = v.object({
  gameKey: NonEmptyStringSchema,
  projection: v.literal('summary'),
  score: BySeatNumberSchema,
  details: v.optional(v.unknown()),
})

export type GameCommandResult<State> = {
  state: State
  outcome?: FrameOutcome | undefined
  protocolEntries: ProtocolEntry[]
}

export type GameCreateStateArgs = {
  targetPointsBySeat: BySeatNumber
  breakerSeat: Seat
  gameConfiguration?: GameConfiguration
}
