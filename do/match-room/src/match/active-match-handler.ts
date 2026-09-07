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
  #storedMatch: StoredActiveMatch
  #state: ResidentState

  constructor(storage: MatchStorage, broadcaster: Broadcaster, storedMatch: StoredActiveMatch) {
    this.#storage = storage
    this.#broadcaster = broadcaster
    this.#storedMatch = storedMatch
    this.#resident = new ResidentMatch()
    this.#state = this.#resident.restore(
      storedMatch.config,
      storedMatch.latestSeq,
      storage.readAcceptedCommands(storedMatch),
    )
  }

  submitCommand(command: MatchCommand): ActiveCommandOutcome {
    const priorReceipt = this.#storage.findCommandReceipt(command)
    if (priorReceipt) {
      if (priorReceipt._tag === 'command-id-conflict') return { response: priorReceipt }
      if (priorReceipt.receipt._tag === 'accepted')
        return {
          response: {
            _tag: 'accepted',
            acceptedSeq: priorReceipt.receipt.acceptedSeq,
            completesMatch: false,
          },
        }
      return { response: priorReceipt.receipt }
    }

    try {
      const result = this.#state.match.execute(command)
      if (result._tag === 'parse-failed') return { response: { _tag: 'invalid-command' } }
      if (result._tag === 'rejected')
        return {
          response: this.#storage.commitRejectedCommand({
            matchId: this.#storedMatch.matchId,
            command,
            reason: result.reason,
          }),
        }

      const state = this.#state.match.project().state
      const committed = this.#storage.commitAcceptedCommand({
        match: this.#storedMatch,
        command: result.command,
        finalState: state.status === 'finished' ? state : null,
      })
      this.#state = this.#resident.advance(
        this.#state,
        committed.acceptedCommand,
        result.protocolEntryContents,
      )
      // Delivery of the match-completing acceptance waits until application has archived the Match in D1.
      if (!committed.streamUpdate.completesMatch) this.#broadcaster.broadcast(committed.streamUpdate)
      const response: ActiveCommandResult = {
        _tag: 'accepted',
        acceptedSeq: committed.receipt.acceptedSeq,
        completesMatch: committed.streamUpdate.completesMatch,
      }
      if (committed.storedMatch.status === 'finalizing')
        return { response, next: { storedMatch: committed.storedMatch, resident: this.#resident } }
      this.#storedMatch = committed.storedMatch
      return { response }
    } catch (error) {
      this.#resident.clear()
      throw error
    }
  }

  getControls(): ActiveControlsResult {
    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
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
    for (let acceptedSeq = since + 1; acceptedSeq <= this.#storedMatch.latestSeq; acceptedSeq += 1)
      backlog.push({ type: 'command-accepted', acceptedSeq, completesMatch: false })
    return { _tag: 'active', response: this.#broadcaster.stream(this.#storedMatch.latestSeq, backlog) }
  }
}

type ActiveCommandOutcome = {
  readonly response: ActiveCommandResult
  readonly next?: {
    readonly storedMatch: StoredFinalizingMatch
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

type ActiveCommandResult =
  | { readonly _tag: 'invalid-command' }
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly completesMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>

export type ActiveStreamResult = { readonly _tag: 'active'; readonly response: Response }
