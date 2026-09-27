import {
  type Match,
  type MatchRoomPresentation,
  type MatchRoomProjection,
  restoreMatchCheckpoint,
} from '@ks/competition'
import type { MatchCommand, MatchScoreProjection, NonNegativeInteger, ProtocolEntry } from '@ks/core'

import { type LiveConnectionCursor, LiveConnectionHandler } from '../live/live-connection-handler'
import type { CommandReceipt, StoredActiveMatch } from '../storage/codecs'
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
      state: projection.state,
      protocolEntryContents: result.protocolEntryContents,
    })

    this.#liveConnections.broadcast(committed.streamUpdate)

    if (committed.streamUpdate.endsMatch) this.#liveConnections.closeAll()

    return {
      _tag: 'accepted',
      acceptedSeq: committed.receipt.acceptedSeq,
      endsMatch: committed.streamUpdate.endsMatch,
    }
  }

  getControls(): ActiveControlsResult {
    const projection = this.#restoreMatch().project()

    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      ...projection,
      lastPlayerEntry: this.#storage.readLastPlayerEntry(this.#storedMatch),
    }
  }

  getProtocol(): ActiveProtocolResult {
    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      ...this.#restoreMatch().projectPresentation(),
      protocolEntries: this.#storage.readProtocol(this.#storedMatch),
    }
  }

  getScore(): ActiveScoreResult {
    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      score: this.#storedMatch.score,
    }
  }

  liveConnectionCursor(): LiveConnectionCursor {
    return { matchId: this.#storedMatch.matchId, latestSeq: this.#storedMatch.latestSeq }
  }

  #restoreMatch(): Match {
    try {
      return restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint(this.#storedMatch))
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

type ActiveControlsResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly lastPlayerEntry: ProtocolEntry | null
} & MatchRoomProjection

type ActiveProtocolResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly protocolEntries: readonly ProtocolEntry[]
} & MatchRoomPresentation

type ActiveScoreResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly score: MatchScoreProjection
}
