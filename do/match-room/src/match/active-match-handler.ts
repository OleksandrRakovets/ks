import { isDeepStrictEqual } from 'node:util'

import { type Match, restoreMatchCheckpoint } from '@ks/competition'
import { type MatchCommand } from '@ks/core'

import type { GetControlsResult, GetProtocolResult, GetScoreResult } from '../contracts'
import { type LiveConnectionCursor, LiveConnectionHandler } from '../live/live-connection-handler'
import type { CommandReceipt, StoredActiveMatch } from '../storage/definitions'
import { MatchStorage } from '../storage/match-storage'

export class ActiveMatchHandler {
  readonly #storage: MatchStorage
  readonly #liveConnections: LiveConnectionHandler
  readonly #storedMatch: StoredActiveMatch

  constructor(storage: MatchStorage, liveConnections: LiveConnectionHandler, storedMatch: StoredActiveMatch) {
    this.#storage = storage
    this.#liveConnections = liveConnections
    this.#storedMatch = storedMatch
  }

  submitCommand(command: MatchCommand): ActiveCommandResult {
    const priorReceipt = this.#storage.findCommandReceipt(command)

    if (priorReceipt) {
      if (priorReceipt._tag === 'command-id-conflict') return priorReceipt

      if (priorReceipt.receipt._tag === 'accepted')
        return {
          _tag: 'accepted',
          acceptedSeq: priorReceipt.receipt.acceptedSeq,
          endsMatch: false,
        }

      return priorReceipt.receipt
    }

    const match = this.#restoreMatch()
    const result = match.execute(command)

    if (result._tag === 'parse-failed') return { _tag: 'invalid-command' }

    if (result._tag === 'rejected')
      return this.#storage.commitRejectedCommand({
        matchId: this.#storedMatch.matchId,
        command,
        reason: result.reason,
      })

    const projection = match.project()

    const committed = this.#storage.commitAcceptedCommand({
      match: this.#storedMatch,
      command: result.command,
      checkpoint: match.exportCheckpoint(),
      presentation: projection,
      protocolEntryContents: result.protocolEntryContents,
      gameResult: match.gameResult(),
    })

    this.#liveConnections.broadcast(committed.streamUpdate)

    if (committed.streamUpdate.endsMatch) this.#liveConnections.closeAll()

    return {
      _tag: 'accepted',
      acceptedSeq: committed.receipt.acceptedSeq,
      endsMatch: committed.streamUpdate.endsMatch,
    }
  }

  getControls() {
    const projection = this.#restoreMatch().project()

    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      ...projection,
      lastPlayerEntry: this.#storage.readLastPlayerEntry(this.#storedMatch),
    } satisfies Extract<GetControlsResult, { _tag: 'active' }>
  }

  getProtocol() {
    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      ...this.#storage.readCurrentPresentation(this.#storedMatch),
      protocolEntries: this.#storage.readProtocol(this.#storedMatch),
    } satisfies Extract<GetProtocolResult, { _tag: 'active' }>
  }

  getScore() {
    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      score: this.#storedMatch.score,
    } satisfies Extract<GetScoreResult, { _tag: 'active' }>
  }

  liveConnectionCursor(): LiveConnectionCursor {
    return { matchId: this.#storedMatch.matchId, latestSeq: this.#storedMatch.latestSeq }
  }

  #restoreMatch(): Match {
    const { checkpoint, state } = this.#storage.readCurrentCheckpoint(this.#storedMatch)

    try {
      const match = restoreMatchCheckpoint(checkpoint)

      if (!isDeepStrictEqual(match.project().state, state)) throw new Error('projection mismatch')

      return match
    } catch (cause) {
      throw new Error('MatchRoom checkpoint storage corruption', { cause })
    }
  }
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
