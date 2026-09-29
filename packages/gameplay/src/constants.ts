import { BySeatNumber, Control, NonEmptyString, Seat, SizedString } from '@ks/core'
import * as v from 'valibot'

export const FrameCommenceCommand = v.pipe(
  v.strictObject({
    type: v.literal('frame.commence'),
    seat: Seat,
  }),
  v.readonly(),
)

export const FoulCommitCommand = v.pipe(
  v.strictObject({
    type: v.literal('foul.commit'),
    seat: Seat,
  }),
  v.readonly(),
)

export const FrameAwardCommand = v.pipe(
  v.strictObject({
    type: v.literal('frame.award'),
    seat: Seat,
  }),
  v.readonly(),
)

export const GameProtocolEntryFields = {
  source: v.picklist(['player', 'system']),
  entryType: SizedString(1, 64),
  seat: Seat,
  scoreAfter: v.optional(BySeatNumber),
} as const

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
