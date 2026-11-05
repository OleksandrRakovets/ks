import type { MatchId, Seat } from '@ks/core'
import type { StrilaBall, StrilaGamePresentation } from '@ks/gameplay/definitions'
import * as v from 'valibot'

/** `short` replaces each first name with its initial. */
export const ScoreboardNames = v.picklist(['full', 'short'])

export type ScoreboardNames = v.InferOutput<typeof ScoreboardNames>

/**
 * A game's fixed artwork size: whether it has a ball row and the widest numbers it can show.
 * It depends only on the game, so each layout and game keep one box in every state.
 */
export type ScoreboardSize = Readonly<{
  ballRow: boolean
  /** Characters in the points boxes, minus sign included. */
  pointChars: number
  /** The widest centre the game can show: its kind and the digits of its race or target. */
  centre: Readonly<{ kind: 'frames' | 'target'; digits: number }>
}>

/**
 * The centre between the points boxes: frames won around the race (`1 (3) 2`), a match to points'
 * bare target, or a separator (`8 : 4`) when per-seat targets leave no single target to show.
 */
export type ScoreboardCentre = Readonly<
  | { kind: 'frames'; A: number; B: number; race: number }
  | { kind: 'target'; target: number }
  | { kind: 'separator' }
>

/** Resolved values for the scoreboard artwork; the artwork derives nothing from a match read. */
export type ScoreboardValues =
  | { readonly kind: 'empty'; readonly matchId: MatchId; readonly size: ScoreboardSize }
  | ScoreboardMatchValues

export type ScoreboardMatchValues = Readonly<{
  kind: 'match'
  matchId: MatchId
  size: ScoreboardSize
  seq: number
  names: Readonly<{ A: string; B: string }>
  /** Set once the match is finished; the artwork keeps showing the final state. */
  winnerSeat: Seat | null
  /** Current points with a typographic minus: frame points, or the match score in a match to points. */
  points: Readonly<{ A: string; B: string }>
  /** Per-seat targets in the target row, with the handicap label under a frames centre. */
  targets: Readonly<{ A: number; B: number; label: string | null }> | null
  centre: ScoreboardCentre
  /** Strila's ball row in table order, or null when there is no ball row to show. */
  balls: readonly ScoreboardBall[] | null
  /** One viewer tip under the player it concerns. */
  tips: Readonly<{ A: ScoreboardTip | null; B: ScoreboardTip | null }>
}>

export type ScoreboardBall = Readonly<{
  ball: StrilaBall
  status: StrilaGamePresentation['details']['ballStatuses'][StrilaBall]
}>

/** A viewer tip: its kind and ball drive the copy, which is resolved before the artwork. */
export type ScoreboardTip = Readonly<
  | { kind: 'third-cue-ball-pot'; text: string }
  | { kind: 'frame-ball' | 'pot-ties-frame' | 'pot-loses-frame'; ball: LastColoredBall; text: string }
>

type LastColoredBall = Extract<
  StrilaGamePresentation['details']['ruleNotes'][number],
  { code: 'last-colored-ball-pot-outcomes' }
>['ball']
