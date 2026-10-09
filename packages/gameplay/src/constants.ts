import { BySeatNumber, Control, Integer, NonEmptyString, Seat, SizedString } from '@ks/core'
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
  /** Setup input limit only; not a gameplay rule or server-side validation constraint. */
  readonly maxFrameTargetPoints: number
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

export const LongFreePyramidRack = v.pipe(
  v.object({
    rackNumber: v.pipe(Integer, v.minValue(1)),
    scoreBySeat: BySeatNumber,
  }),
  v.readonly(),
)

export type LongFreePyramidRack = v.InferOutput<typeof LongFreePyramidRack>

/** Game-owned result retained after its single frame ends, including a rollover's empty final rack. */
const LongFreePyramidResult = v.pipe(
  v.object({
    gameKey: v.literal('free-pyramid-long'),
    racks: v.pipe(v.array(LongFreePyramidRack), v.minLength(1), v.readonly()),
  }),
  v.readonly(),
)

/** Replace this alias with a discriminated union when another registered game adds a bespoke result. */
export const GameResult = LongFreePyramidResult

export type GameResult = v.InferOutput<typeof GameResult>

/** Closed rack state for executable checkpoints; public racks intentionally strip unknown fields. */
export const LongFreePyramidRackCheckpoint = v.pipe(
  v.strictObject({
    ...LongFreePyramidRack.entries,
    scoreBySeat: v.pipe(v.strictObject(BySeatNumber.entries), v.readonly()),
  }),
  v.readonly(),
)

export type LongFreePyramidRackCheckpoint = v.InferOutput<typeof LongFreePyramidRackCheckpoint>

/** Retained aggregate state, distinct from the tolerant archived/public result representation. */
export const GameResultCheckpoint = v.pipe(
  v.strictObject({
    ...GameResult.entries,
    racks: v.pipe(v.array(LongFreePyramidRackCheckpoint), v.minLength(1), v.readonly()),
  }),
  v.readonly(),
)

export type GameResultCheckpoint = v.InferOutput<typeof GameResultCheckpoint>
