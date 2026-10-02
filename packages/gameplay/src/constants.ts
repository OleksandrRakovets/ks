import { BySeatNumber, Control, Integer, NonEmptyString, Seat, SizedString, StrictStruct } from '@ks/core'
import { Schema } from 'effect'

export const FrameCommenceCommand = StrictStruct({
  type: Schema.Literal('frame.commence'),
  seat: Seat,
})

export const FoulCommitCommand = StrictStruct({
  type: Schema.Literal('foul.commit'),
  seat: Seat,
})

export const FrameAwardCommand = StrictStruct({
  type: Schema.Literal('frame.award'),
  seat: Seat,
})

export const GameProtocolEntryFields = {
  source: Schema.Literals(['player', 'system']),
  entryType: SizedString(1, 64),
  seat: Seat,
  scoreAfter: Schema.optional(BySeatNumber),
} as const

type LocalizedGameTitle = {
  readonly uk: string
  readonly en: string
}

export type GameMeta = {
  readonly title: LocalizedGameTitle
  readonly shortGameTitle: LocalizedGameTitle
  readonly defaultFrameTargetPointsBySeat: typeof BySeatNumber.Type
  /** Setup input limit only; not a gameplay rule or server-side validation constraint. */
  readonly maxFrameTargetPoints: number
}

export const GameControl = Schema.Struct({ ...Control.fields, source: Schema.Literal('game') })

export type GameControlProjection<Presentation> = {
  readonly game: Presentation
  readonly controls: readonly (typeof GameControl.Type)[]
}

export const GamePresentation = Schema.Struct({
  gameKey: NonEmptyString,
  score: BySeatNumber,
  details: Schema.optional(Schema.Unknown),
})

export const LongFreePyramidRack = Schema.Struct({
  rackNumber: Integer.check(Schema.isGreaterThanOrEqualTo(1)),
  scoreBySeat: BySeatNumber,
})

/** Game-owned result retained after its single frame ends, including a rollover's empty final rack. */
const LongFreePyramidResult = Schema.Struct({
  gameKey: Schema.Literal('free-pyramid-long'),
  racks: Schema.Array(LongFreePyramidRack).check(Schema.isMinLength(1)),
})

/** Replace this alias with a discriminated union when another registered game adds a bespoke result. */
export const GameResult = LongFreePyramidResult
