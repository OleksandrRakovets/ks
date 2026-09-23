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

import { LiveConnectionHandler } from '../live/live-connection-handler'
import { type CommandReceipt, MatchStorage, type StoredFinalizingMatch } from '../storage/match-storage'
import { ResidentMatch, type ResidentState } from './resident-match'

export class FinalizingMatchHandler {
  readonly #storage: MatchStorage
  readonly #liveConnections: LiveConnectionHandler
  readonly #storedMatch: StoredFinalizingMatch
  #resident: ResidentMatch | null

  constructor(
    storage: MatchStorage,
    liveConnections: LiveConnectionHandler,
    storedMatch: StoredFinalizingMatch,
    resident: ResidentMatch | null = null,
  ) {
    this.#storage = storage
    this.#liveConnections = liveConnections
    this.#storedMatch = storedMatch
    this.#resident = resident
  }

  submitCommand(command: MatchCommand): FinalizingCommandResult {
    const prior = this.#storage.findCommandReceipt(command)

    if (!prior) return { _tag: 'finalizing' }

    if (prior._tag === 'command-id-conflict') return prior

    if (prior.receipt._tag === 'rejected') return prior.receipt

    return {
      _tag: 'accepted',
      acceptedSeq: prior.receipt.acceptedSeq,
      endsMatch: prior.receipt.acceptedSeq === this.#storedMatch.latestSeq,
    }
  }

  getControls(): FinalizingResult {
    return { _tag: 'finalizing' }
  }

  getProtocol(): FinalizingResult {
    return { _tag: 'finalizing' }
  }

  getScore(): FinalizingResult {
    return { _tag: 'finalizing' }
  }

  prepareArchive(): FinishedMatchTransfer {
    const resident = this.#load()
    const projected = resident.match.project().state

    if (!isDeepStrictEqual(projected, this.#storedMatch.finalState))
      throw new Error('MatchRoom final state does not match accepted history')

    return {
      matchId: this.#storedMatch.matchId,
      gameKey: this.#storedMatch.config.gameKey,
      createdAt: this.#storedMatch.createdAt,
      sourceLatestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      protocolEntries: resident.protocolEntries,
      finalState: this.#storedMatch.finalState,
    }
  }

  finalize(): void {
    this.#liveConnections.broadcast({
      type: 'command-accepted',
      acceptedSeq: this.#storedMatch.latestSeq,
      endsMatch: true,
    })
    this.#liveConnections.closeAll()
    this.#resident?.clear()
    this.#resident = null
  }

  #load(): ResidentState {
    const resident = this.#resident ?? new ResidentMatch()
    this.#resident = resident

    return (
      resident.lookup(this.#storedMatch.latestSeq) ??
      resident.restore(
        this.#storedMatch.config,
        this.#storedMatch.latestSeq,
        this.#storage.readAcceptedCommands(this.#storedMatch),
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
      readonly endsMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>

export type FinishedMatchTransfer = {
  readonly matchId: MatchId
  readonly gameKey: RegisteredGameKey
  readonly createdAt: UnixEpochMilliseconds
  readonly sourceLatestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
  readonly protocolEntries: readonly ProtocolEntry[]
  readonly finalState: MatchState
}
