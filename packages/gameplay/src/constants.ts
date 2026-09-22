import { BySeatNumber, Control, NonEmptyString } from '@ks/core'
import * as v from 'valibot'

type LocalizedGameTitle = {
  readonly uk: string
  readonly en: string
}

export type GameMeta = {
  readonly title: LocalizedGameTitle
  readonly shortGameTitle: LocalizedGameTitle
  readonly defaultFrameTargetPointsBySeat: BySeatNumber
}

export const GameControl = v.pipe(v.object({ ...Control.entries, source: v.literal('game') }), v.readonly())

export type GameControl = v.InferOutput<typeof GameControl>

export type GameControlProjection<Presentation> = {
  readonly game: Presentation
  readonly controls: readonly GameControl[]
}

export const GamePresentation = v.pipe(
  v.object({
    gameKey: NonEmptyString,
    score: BySeatNumber,
    details: v.optional(v.unknown()),
  }),
  v.readonly(),
)

export type GamePresentation = v.InferOutput<typeof GamePresentation>
