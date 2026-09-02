import { BySeatNumber, Control, emptyControlSections, NonEmptyString } from '@ks/core'
import * as v from 'valibot'

type LocalizedGameTitle = {
  readonly uk: string
  readonly en: string
}

export type GameMeta = {
  readonly title: LocalizedGameTitle
  readonly defaultFrameTargetPointsBySeat: BySeatNumber
}

export const GameControl = v.pipe(v.object({ ...Control.entries, source: v.literal('game') }), v.readonly())
export type GameControl = v.InferOutput<typeof GameControl>

export function deriveGameControlSections(controls: readonly GameControl[]) {
  const sections = emptyControlSections()

  for (const entry of controls) {
    if (entry.seat) sections[entry.prominence][entry.seat].push(entry)
    else sections.neutral.push(entry)
  }

  return sections
}

export const GameControlProjection = v.pipe(
  v.object({
    gameKey: NonEmptyString,
    projection: v.literal('control'),
    score: BySeatNumber,
    details: v.optional(v.unknown()),
  }),
  v.readonly(),
)
export type GameControlProjection = v.InferOutput<typeof GameControlProjection>
