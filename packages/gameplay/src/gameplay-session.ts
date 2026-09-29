import type { BySeatNumber, FrameOutcome, Seat } from '@ks/core'
import * as v from 'valibot'

import type { GameControl } from './constants'
import type { LongFreePyramidResult } from './long-free-pyramid/definitions'
import { LongFreePyramidProtocolEntry } from './long-free-pyramid/protocol'
import { PyramidProtocolEntry } from './pyramid/protocol'
import type { GameCommandFor, GameKey, GameplayCheckpointStateFor, GamePresentationFor } from './registry'
import { StrilaProtocolEntry } from './strila-v2/definitions'

export const GameProtocolEntry = v.union([
  StrilaProtocolEntry,
  LongFreePyramidProtocolEntry,
  PyramidProtocolEntry,
])

export type GameProtocolEntry = v.InferOutput<typeof GameProtocolEntry>

type GameResult = LongFreePyramidResult

export const GameCommandRejection = v.pipe(
  v.object({ code: v.literal('command-not-available') }),
  v.readonly(),
)

export type GameCommandRejection = v.InferOutput<typeof GameCommandRejection>

export type GameCommandExecution =
  | {
      readonly _tag: 'accepted'
      readonly gameProtocolEntries: readonly [GameProtocolEntry, ...GameProtocolEntry[]]
      readonly outcome?: FrameOutcome
    }
  | { readonly _tag: 'rejected'; readonly reason: GameCommandRejection }

type GameplaySessionCreateArgsByKey = {
  readonly 'strila-v2': { readonly targetPointsBySeat: BySeatNumber }
  readonly 'free-pyramid': { readonly targetPointsBySeat: BySeatNumber }
  readonly 'free-pyramid-long': { readonly targetPointsBySeat: BySeatNumber; readonly rackRollover: 14 | 15 }
  readonly 'combined-pyramid': { readonly targetPointsBySeat: BySeatNumber }
  readonly 'combined-pyramid-old': { readonly targetPointsBySeat: BySeatNumber }
}

export type GameplaySessionCreateArgsFor<K extends GameKey> = GameplaySessionCreateArgsByKey[K]

/** Resident gameplay for one active frame of a registered game. */
export interface GameplaySession<K extends GameKey> {
  readonly gameKey: K

  /** Plain machine state, including hidden rule context; no runtime snapshot methods. */
  exportCheckpoint(): GameplayCheckpointStateFor<K>

  /**
   * Executes one trusted typed game command.
   * Rejection retains the current snapshot. Acceptance validates output before assigning the candidate snapshot.
   * @throws An unrecoverable defect when machine, protocol, or outcome invariants fail.
   */
  execute(command: GameCommandFor<K>): GameCommandExecution

  /** @returns A fresh copy of the current frame score by seat. */
  getScore(): BySeatNumber

  /** Reports machine commencement availability; competition remains authoritative for the scheduled breaker. */
  canCommence(seat: Seat): boolean

  /** Reports whether either player may concede before gameplay has determined a winner. */
  canConcede(): boolean

  /** Coherently derives game presentation and its flat controls from the same resident snapshot. */
  deriveControls(): { readonly game: GamePresentationFor<K>; readonly controls: readonly GameControl[] }

  /** Returns game-owned result data when this game has a bespoke finished presentation. */
  deriveResult?(): GameResult
}

export const commandNotAvailable = (): GameCommandExecution => ({
  _tag: 'rejected',
  reason: { code: 'command-not-available' },
})
