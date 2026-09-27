import { type Match, type MatchStateFor, restoreMatchCheckpoint } from '@ks/competition'
import type { Control, MatchCommand, MatchScoreProjection, NonNegativeInteger, ProtocolEntry } from '@ks/core'
import type { GamePresentationFor, RegisteredGameKey } from '@ks/gameplay/definitions'

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

    const committed = this.#storage.commitAcceptedCommand({
      match: this.#storedMatch,
      command: result.command,
      checkpoint: match.exportCheckpoint(),
      state: match.state(),
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
    const match = this.#restoreMatch()

    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      ...presentationOf(match),
      controls: match.controls(),
      lastPlayerEntry: this.#storage.readLastPlayerEntry(this.#storedMatch),
    }
  }

  getProtocol(): ActiveProtocolResult {
    const match = this.#restoreMatch()

    return {
      _tag: 'active',
      latestSeq: this.#storedMatch.latestSeq,
      ...presentationOf(match),
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

type ActivePresentationFor<K extends RegisteredGameKey> = {
  readonly state: MatchStateFor<K>
  readonly game: GamePresentationFor<K> | undefined
}

type ActivePresentation = {
  [K in RegisteredGameKey]: ActivePresentationFor<K>
}[RegisteredGameKey]

function presentationOf(match: Match): ActivePresentation {
  // SAFETY: Match construction and restoration correlate lifecycle config with gameplay; both values come from that
  // same resident without intervening mutation.
  return { state: match.state(), game: match.gamePresentation() } as ActivePresentation
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
  readonly controls: readonly Control[]
  readonly lastPlayerEntry: ProtocolEntry | null
} & ActivePresentation

type ActiveProtocolResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly protocolEntries: readonly ProtocolEntry[]
} & ActivePresentation

type ActiveScoreResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly score: MatchScoreProjection
}
