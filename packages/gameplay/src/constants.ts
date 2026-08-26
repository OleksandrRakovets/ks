import {
  type BySeatNumber,
  BySeatNumberSchema,
  ControlCommandPresetSchema,
  emptyControlCommandSections,
  NonEmptyStringSchema,
} from '@ks/core'
import * as v from 'valibot'

type LocalizedGameTitle = {
  uk: string
  en: string
}

export type GameMeta = {
  title: LocalizedGameTitle
  defaultFrameTargetPointsBySeat: BySeatNumber
}

export const GameControlCommandSchema = v.object({ ...ControlCommandPresetSchema.entries, source: v.literal('game') })
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
