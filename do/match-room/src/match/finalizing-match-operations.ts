import { isDeepStrictEqual } from 'node:util'

import type {
  MatchCommand,
  MatchId,
  MatchState,
  NonNegativeInteger,
  ProtocolEntry,
  UnixEpochMilliseconds,
} from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'

import { Broadcaster } from '../live/broadcaster'
import { type CommandReceipt, MatchStorage, type StoredFinalizingMatch } from '../storage/match-storage'
import { ResidentMatch, type ResidentState } from './resident-match'

export class FinalizingMatchOperations {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #stored: StoredFinalizingMatch
  #resident: ResidentMatch | null

  constructor(
    storage: MatchStorage,
    broadcaster: Broadcaster,
    stored: StoredFinalizingMatch,
    resident: ResidentMatch | null = null,
  ) {
    this.#storage = storage
    this.#broadcaster = broadcaster
    this.#stored = stored
    this.#resident = resident
  }

  submitCommand(command: MatchCommand): FinalizingCommandResult {
    const prior = this.#storage.findCommandReceipt(command)
    if (!prior) return { _tag: 'finalizing' }
    if (prior._tag === 'command-id-conflict') return prior
    return prior.receipt._tag === 'accepted'
      ? {
          _tag: 'accepted',
          acceptedSeq: prior.receipt.acceptedSeq,
          finalizesMatch: prior.receipt.acceptedSeq === this.#stored.latestSeq,
        }
      : prior.receipt
  }

  getControls(): FinalizingResult {
    return { _tag: 'finalizing' }
  }

  getProtocol(): FinalizingResult {
    return { _tag: 'finalizing' }
  }

  stream(): FinalizingResult {
    return { _tag: 'finalizing' }
  }

  prepareArchive(): CompletedMatchTransfer {
    const resident = this.#load()
    const projected = resident.match.project().state
    if (!isDeepStrictEqual(projected, this.#stored.finalState))
      throw new Error('MatchRoom final state does not match accepted history')
    return {
      matchId: this.#stored.matchId,
      gameKey: this.#stored.config.gameKey,
      createdAt: this.#stored.createdAt,
      sourceLatestSeq: this.#stored.latestSeq,
      endedAt: this.#stored.endedAt,
      protocolEntries: resident.protocolEntries,
      finalState: this.#stored.finalState,
    }
  }

  finalize(): void {
    this.#broadcaster.broadcast({
      type: 'command-accepted',
      acceptedSeq: this.#stored.latestSeq,
      terminal: true,
    })
    this.#broadcaster.closeAll()
    this.#resident?.clear()
    this.#resident = null
  }

  dispose(): void {
    this.#resident?.clear()
    this.#resident = null
  }

  #load(): ResidentState {
    const resident = this.#resident ?? new ResidentMatch()
    this.#resident = resident
    return (
      resident.lookup(this.#stored.latestSeq) ??
      resident.restore(
        this.#stored.config,
        this.#stored.latestSeq,
        this.#storage.readAcceptedCommands(this.#stored),
      )
    )
  }
}

export type FinalizingResult = { readonly _tag: 'finalizing' }
export type FinalizingCommandResult =
  | FinalizingResult
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly finalizesMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>

export type CompletedMatchTransfer = {
  readonly matchId: MatchId
  readonly gameKey: RegisteredGameKey
  readonly createdAt: UnixEpochMilliseconds
  readonly sourceLatestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
  readonly protocolEntries: readonly ProtocolEntry[]
  readonly finalState: MatchState
}
