import type { SparringMatchRoomProjection } from '@ks/competition'
import type { MatchCommand, MatchStreamUpdate, ProtocolEntry } from '@ks/core'

import { Broadcaster } from '../live/broadcaster'
import { type CommandReceipt, MatchStorage, type StoredActiveMatch } from '../storage/match-storage'
import { ResidentMatch, type ResidentState } from './resident-match'

export class ActiveMatchOperations {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #resident: ResidentMatch

  constructor(storage: MatchStorage, broadcaster: Broadcaster, resident: ResidentMatch) {
    this.#storage = storage
    this.#broadcaster = broadcaster
    this.#resident = resident
  }

  submitCommand(stored: StoredActiveMatch, command: MatchCommand): ActiveCommandResult {
    const priorReceipt = this.#storage.findCommandReceipt(command)
    if (priorReceipt) {
      if (priorReceipt._tag === 'command-id-conflict') return priorReceipt
      return priorReceipt.receipt._tag === 'accepted'
        ? { _tag: 'accepted', acceptedSeq: priorReceipt.receipt.acceptedSeq, finalizesMatch: false }
        : priorReceipt.receipt
    }

    const resident = this.#load(stored)
    try {
      const result = resident.match.execute(command)
      if (result._tag === 'parse-failed') return { _tag: 'invalid-command' }
      if (result._tag === 'rejected')
        return this.#storage.commitRejectedCommand({
          matchId: stored.matchId,
          command,
          reason: result.reason,
        })

      const state = resident.match.project().state
      const committed = this.#storage.commitAcceptedCommand({
        match: stored,
        command: result.command,
        finalState: state.status === 'finished' ? state : null,
      })
      this.#resident.publishAcceptance(resident, committed.acceptedCommand, result.protocolEntryContents)
      if (!committed.update.terminal) this.#broadcaster.broadcast(committed.update)
      return {
        _tag: 'accepted',
        acceptedSeq: committed.receipt.acceptedSeq,
        finalizesMatch: committed.update.terminal,
      }
    } catch (error) {
      this.#resident.clear()
      throw error
    }
  }

  getControls(stored: StoredActiveMatch): ActiveControlsResult {
    return {
      _tag: 'active',
      latestSeq: stored.latestSeq,
      ...this.#load(stored).match.project(),
    }
  }

  getProtocol(stored: StoredActiveMatch): ActiveProtocolResult {
    const resident = this.#load(stored)
    return {
      _tag: 'active',
      latestSeq: resident.latestSeq,
      state: resident.match.project().state,
      protocolEntries: resident.protocolEntries,
    }
  }

  stream(stored: StoredActiveMatch, since = 0): ActiveStreamResult {
    const backlog: MatchStreamUpdate[] = []
    for (let acceptedSeq = since + 1; acceptedSeq <= stored.latestSeq; acceptedSeq += 1)
      backlog.push({ type: 'command-accepted', acceptedSeq, terminal: false })
    return { _tag: 'active', response: this.#broadcaster.stream(stored.latestSeq, backlog) }
  }

  #load(stored: StoredActiveMatch): ResidentState {
    return (
      this.#resident.lookup(stored.latestSeq) ??
      this.#resident.restore(stored.config, stored.latestSeq, this.#storage.readAcceptedCommands(stored))
    )
  }
}

export type ActiveControlsResult = {
  readonly _tag: 'active'
  readonly latestSeq: number
} & SparringMatchRoomProjection

export type ActiveProtocolResult = {
  readonly _tag: 'active'
  readonly latestSeq: number
  readonly state: SparringMatchRoomProjection['state']
  readonly protocolEntries: readonly ProtocolEntry[]
}

export type ActiveCommandResult =
  | { readonly _tag: 'invalid-command' }
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly finalizesMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>

export type ActiveStreamResult = { readonly _tag: 'active'; readonly response: Response }
