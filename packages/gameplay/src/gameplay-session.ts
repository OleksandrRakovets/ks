import type { BySeatNumber, FrameOutcome, ProtocolEntry, Seat } from '@ks/core'
import * as v from 'valibot'

import type { ControlProjectionFor, GameCommandFor, RegisteredGameKey } from './registry'

export const GameCommandRejectionSchema = v.object({ code: v.literal('command-not-available') })
export type GameCommandRejection = v.InferOutput<typeof GameCommandRejectionSchema>

export type NonEmptyProtocolEntries = readonly [ProtocolEntry, ...ProtocolEntry[]]

export type GameCommandExecution =
  | { readonly _tag: 'accepted'; readonly protocolEntries: NonEmptyProtocolEntries; readonly outcome?: FrameOutcome }
  | { readonly _tag: 'rejected'; readonly reason: GameCommandRejection }

type GameplaySessionCreateArgsByKey = {
  readonly 'strila-v2': { readonly targetPointsBySeat: BySeatNumber }
  readonly 'free-pyramid': { readonly targetPointsBySeat: BySeatNumber }
  readonly 'free-pyramid-long': { readonly targetPointsBySeat: BySeatNumber; readonly rackRollover: 14 | 15 }
  readonly 'combined-pyramid': { readonly targetPointsBySeat: BySeatNumber }
  readonly 'combined-pyramid-old': { readonly targetPointsBySeat: BySeatNumber }
}
export type GameplaySessionCreateArgsFor<K extends RegisteredGameKey> = GameplaySessionCreateArgsByKey[K]

/** Resident gameplay for one active frame of a registered game. */
export interface GameplaySession<K extends RegisteredGameKey> {
  readonly gameKey: K

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

  /** @returns A fresh keyed browser control projection for the current snapshot. */
  deriveControl(): ControlProjectionFor<K>
}

export const commandNotAvailable = (): GameCommandExecution => ({
  _tag: 'rejected',
  reason: { code: 'command-not-available' },
})
