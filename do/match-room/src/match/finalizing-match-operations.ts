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
  readonly #resident: ResidentMatch

  constructor(storage: MatchStorage, broadcaster: Broadcaster, resident: ResidentMatch) {
    this.#storage = storage
    this.#broadcaster = broadcaster
    this.#resident = resident
  }

  submitCommand(stored: StoredFinalizingMatch, command: MatchCommand): FinalizingCommandResult {
    const prior = this.#storage.findCommandReceipt(command)
    if (!prior) return { _tag: 'finalizing' }
    if (prior._tag === 'command-id-conflict') return prior
    return prior.receipt._tag === 'accepted'
      ? {
          _tag: 'accepted',
          acceptedSeq: prior.receipt.acceptedSeq,
          finalizesMatch: prior.receipt.acceptedSeq === stored.latestSeq,
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

  prepareArchive(stored: StoredFinalizingMatch): CompletedMatchTransfer {
    const resident = this.#load(stored)
    const projected = resident.match.project().state
    if (!isDeepStrictEqual(projected, stored.finalState))
      throw new Error('MatchRoom final state does not match accepted history')
    return {
      matchId: stored.matchId,
      gameKey: stored.config.gameKey,
      createdAt: stored.createdAt,
      sourceLatestSeq: stored.latestSeq,
      endedAt: stored.endedAt,
      protocolEntries: resident.protocolEntries,
      finalState: stored.finalState,
    }
  }

  closeForFinalization(stored: StoredFinalizingMatch): void {
    this.#broadcaster.broadcast({
      type: 'command-accepted',
      acceptedSeq: stored.latestSeq,
      terminal: true,
    })
    this.#broadcaster.closeAll()
  }

  #load(stored: StoredFinalizingMatch): ResidentState {
    return (
      this.#resident.lookup(stored.latestSeq) ??
      this.#resident.restore(stored.config, stored.latestSeq, this.#storage.readAcceptedCommands(stored))
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
