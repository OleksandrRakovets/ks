import { correctMatch, isCorrectionCommand, type Match, type MatchRoomProjection } from '@ks/competition'
import {
  type MatchCommand,
  type MatchScoreProjection,
  type NonNegativeInteger,
  projectMatchScore,
  type ProtocolEntry,
} from '@ks/core'

import { type LiveConnectionCursor, LiveConnectionHandler } from '../live/live-connection-handler'
import {
  type CommandReceipt,
  MatchStorage,
  type StoredActiveMatch,
  type StoredFinalizingMatch,
} from '../storage/match-storage'
import { ResidentMatch, type ResidentState } from './resident-match'

export class ActiveMatchHandler {
  readonly #storage: MatchStorage
  readonly #liveConnections: LiveConnectionHandler
  readonly #resident: ResidentMatch
  #storedMatch: StoredActiveMatch
  #state: ResidentState

  constructor(storage: MatchStorage, liveConnections: LiveConnectionHandler, storedMatch: StoredActiveMatch) {
    this.#storage = storage
    this.#liveConnections = liveConnections
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
            endsMatch: false,
          },
        }

      return { response: priorReceipt.receipt }
    }

    try {
      return isCorrectionCommand(command)
        ? this.#submitCorrection(command)
        : this.#submitRegularCommand(command)
    } catch (error) {
      this.#resident.clear()
      throw error
    }
  }

  #submitRegularCommand(command: MatchCommand): ActiveCommandOutcome {
    const result = this.#state.match.execute(command)

    if (result._tag !== 'accepted') return this.#failed(command, result)
    const committed = this.#commit(result, this.#state.match)
    this.#state = this.#resident.advance(this.#state, committed.acceptedCommand, result.protocolEntryContents)

    return this.#accepted(committed)
  }

  #submitCorrection(command: MatchCommand): ActiveCommandOutcome {
    const correction = correctMatch(
      this.#storedMatch.config,
      this.#storage.readAcceptedCommands(this.#storedMatch),
      command,
    )

    if (!correction.match) return this.#failed(command, correction.result)
    const committed = this.#commit(correction.result, correction.match)
    this.#state = this.#resident.rewind(
      this.#state,
      committed.acceptedCommand,
      correction.result.protocolEntryContents,
      correction.match,
    )

    return this.#accepted(committed)
  }

  #failed(
    command: MatchCommand,
    result: Exclude<ReturnType<Match['execute']>, { _tag: 'accepted' }>,
  ): ActiveCommandOutcome {
    if (result._tag === 'parse-failed') return { response: { _tag: 'invalid-command' } }

    return {
      response: this.#storage.commitRejectedCommand({
        matchId: this.#storedMatch.matchId,
        command,
        reason: result.reason,
      }),
    }
  }

  #commit(result: Extract<ReturnType<Match['execute']>, { _tag: 'accepted' }>, match: Match) {
    const state = match.project().state

    return this.#storage.commitAcceptedCommand({
      match: this.#storedMatch,
      command: result.command,
      finalState: state.status === 'finished' ? state : null,
      gameResult: match.gameResult(),
    })
  }

  #accepted(committed: ReturnType<MatchStorage['commitAcceptedCommand']>): ActiveCommandOutcome {
    this.#liveConnections.broadcast(committed.streamUpdate)

    if (committed.streamUpdate.endsMatch) this.#liveConnections.closeAll()

    const response: ActiveCommandResult = {
      _tag: 'accepted',
      acceptedSeq: committed.receipt.acceptedSeq,
      endsMatch: committed.streamUpdate.endsMatch,
    }

    if (committed.storedMatch.status === 'finalizing')
      return { response, next: { storedMatch: committed.storedMatch, resident: this.#resident } }
    this.#storedMatch = committed.storedMatch

    return { response }
  }

  getControls(): ActiveControlsResult {
    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      ...this.#state.match.project(),
    }
  }

  getProtocol(): ActiveProtocolResult {
    const { state, game } = this.#state.match.project()

    return {
      _tag: 'active',
      latestSeq: this.#state.latestSeq,
      state,
      game,
      protocolEntries: this.#state.protocolEntries,
    }
  }

  getScore(): ActiveScoreResult {
    return {
      _tag: 'active',
      latestSeq: this.#state.latestSeq,
      score: projectMatchScore(this.#state.match.project().state),
    }
  }

  liveConnectionCursor(): LiveConnectionCursor {
    return { matchId: this.#storedMatch.matchId, latestSeq: this.#storedMatch.latestSeq }
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
} & MatchRoomProjection

export type ActiveProtocolResult = {
  readonly _tag: 'active'
  readonly latestSeq: number
  readonly protocolEntries: readonly ProtocolEntry[]
} & Omit<MatchRoomProjection, 'controls'>

export type ActiveScoreResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly score: MatchScoreProjection
}

type ActiveCommandResult =
  | { readonly _tag: 'invalid-command' }
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly endsMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>
