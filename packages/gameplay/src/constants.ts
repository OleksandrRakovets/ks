import { BySeatNumber, Control, emptyControlSections, NonEmptyString } from '@ks/core'
import * as v from 'valibot'

type LocalizedGameTitle = {
  uk: string
  en: string
}

export type GameMeta = {
  title: LocalizedGameTitle
  defaultFrameTargetPointsBySeat: BySeatNumber
}

export const GameControl = v.object({ ...Control.entries, source: v.literal('game') })
export type GameControl = v.InferOutput<typeof GameControl>

export function deriveGameControlSections(controls: readonly GameControl[]) {
  const sections = emptyControlSections()

  for (const entry of controls) {
    if (entry.seat) sections[entry.prominence][entry.seat].push(entry)
    else sections.neutral.push(entry)
  }

  return sections
}

export const GameControlProjection = v.object({
  gameKey: NonEmptyString,
  projection: v.literal('control'),
  score: BySeatNumber,
  details: v.optional(v.unknown()),
})
export type GameControlProjectionInput = v.InferOutput<typeof GameControlProjection>
