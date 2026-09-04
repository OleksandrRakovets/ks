import type { SparringMatchRoomProjection } from '@ks/competition'
import type { MatchCommand, MatchStreamUpdate, ProtocolEntry } from '@ks/core'

import { Broadcaster } from '../live/broadcaster'
import {
  type CommandReceipt,
  MatchStorage,
  type StoredActiveMatch,
  type StoredFinalizingMatch,
} from '../storage/match-storage'
import { ResidentMatch, type ResidentState } from './resident-match'

export class ActiveMatchHandler {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #resident: ResidentMatch
  #stored: StoredActiveMatch
  #state: ResidentState

  constructor(storage: MatchStorage, broadcaster: Broadcaster, stored: StoredActiveMatch) {
    this.#storage = storage
    this.#broadcaster = broadcaster
    this.#stored = stored
    this.#resident = new ResidentMatch()
    this.#state = this.#resident.restore(stored.config, stored.latestSeq, storage.readAcceptedCommands(stored))
  }

  submitCommand(command: MatchCommand): ActiveCommandOutcome {
    const priorReceipt = this.#storage.findCommandReceipt(command)
    if (priorReceipt) {
      if (priorReceipt._tag === 'command-id-conflict') return { response: priorReceipt }
      return {
        response:
          priorReceipt.receipt._tag === 'accepted'
            ? { _tag: 'accepted', acceptedSeq: priorReceipt.receipt.acceptedSeq, finalizesMatch: false }
            : priorReceipt.receipt,
      }
    }

    try {
      const result = this.#state.match.execute(command)
      if (result._tag === 'parse-failed') return { response: { _tag: 'invalid-command' } }
      if (result._tag === 'rejected')
        return {
          response: this.#storage.commitRejectedCommand({
            matchId: this.#stored.matchId,
            command,
            reason: result.reason,
          }),
        }

      const state = this.#state.match.project().state
      const committed = this.#storage.commitAcceptedCommand({
        match: this.#stored,
        command: result.command,
        finalState: state.status === 'finished' ? state : null,
      })
      this.#state = this.#resident.publishAcceptance(
        this.#state,
        committed.acceptedCommand,
        result.protocolEntryContents,
      )
      if (!committed.update.terminal) this.#broadcaster.broadcast(committed.update)
      const response: ActiveCommandResult = {
        _tag: 'accepted',
        acceptedSeq: committed.receipt.acceptedSeq,
        finalizesMatch: committed.update.terminal,
      }
      if (committed.stored.status === 'active') {
        this.#stored = committed.stored
        return { response }
      }
      return {
        response,
        next: { stored: committed.stored, resident: this.#resident },
      }
    } catch (error) {
      this.#resident.clear()
      throw error
    }
  }

  getControls(): ActiveControlsResult {
    return {
      _tag: 'active',
      latestSeq: this.#stored.latestSeq,
      ...this.#state.match.project(),
    }
  }

  getProtocol(): ActiveProtocolResult {
    return {
      _tag: 'active',
      latestSeq: this.#state.latestSeq,
      state: this.#state.match.project().state,
      protocolEntries: this.#state.protocolEntries,
    }
  }

  stream(since = 0): ActiveStreamResult {
    const backlog: MatchStreamUpdate[] = []
    for (let acceptedSeq = since + 1; acceptedSeq <= this.#stored.latestSeq; acceptedSeq += 1)
      backlog.push({ type: 'command-accepted', acceptedSeq, terminal: false })
    return { _tag: 'active', response: this.#broadcaster.stream(this.#stored.latestSeq, backlog) }
  }
}

type ActiveCommandOutcome = {
  readonly response: ActiveCommandResult
  readonly next?: {
    readonly stored: StoredFinalizingMatch
    readonly resident: ResidentMatch
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
