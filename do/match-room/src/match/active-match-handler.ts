import { isDeepStrictEqual } from 'node:util'

import { type Match, type MatchRoomProjection, restoreMatchCheckpoint } from '@ks/competition'
import {
  type MatchCommand,
  type MatchScoreProjection,
  type NonNegativeInteger,
  type ProtocolEntry,
} from '@ks/core'

import { type LiveConnectionCursor, LiveConnectionHandler } from '../live/live-connection-handler'
import { type CommandReceipt, MatchStorage, type StoredActiveMatch } from '../storage/match-storage'

export class ActiveMatchHandler {
  readonly #storage: MatchStorage
  readonly #liveConnections: LiveConnectionHandler
  readonly #header: StoredActiveMatch

  constructor(storage: MatchStorage, liveConnections: LiveConnectionHandler, header: StoredActiveMatch) {
    this.#storage = storage
    this.#liveConnections = liveConnections
    this.#header = header
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
        matchId: this.#header.matchId,
        command,
        reason: result.reason,
      })

    const committed = this.#storage.commitAcceptedCommand({
      match: this.#header,
      command: result.command,
      checkpoint: match.exportCheckpoint(),
      projection: match.project(),
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

  getControls(): ActiveControlsResult {
    const projection = this.#restoreMatch().project()

    return {
      _tag: 'active',
      latestSeq: this.#header.latestSeq,
      ...projection,
      lastPlayerEntry: this.#storage.readLastPlayerEntry(this.#header),
    }
  }

  getProtocol(): ActiveProtocolResult {
    return {
      _tag: 'active',
      latestSeq: this.#header.latestSeq,
      ...this.#storage.readCurrentProjection(this.#header),
      protocolEntries: this.#storage.readProtocol(this.#header),
    }
  }

  getScore(): ActiveScoreResult {
    return {
      _tag: 'active',
      latestSeq: this.#header.latestSeq,
      score: this.#header.score,
    }
  }

  liveConnectionCursor(): LiveConnectionCursor {
    return { matchId: this.#header.matchId, latestSeq: this.#header.latestSeq }
  }

  #restoreMatch(): Match {
    const { checkpoint, state } = this.#storage.readCurrentCheckpoint(this.#header)

    try {
      const match = restoreMatchCheckpoint(checkpoint)

      if (!isDeepStrictEqual(match.project().state, state)) throw new Error('projection mismatch')

      return match
    } catch {
      throw new Error('MatchRoom checkpoint storage corruption')
    }
  }
}

export type ActiveControlsResult = {
  readonly _tag: 'active'
  readonly latestSeq: number
  readonly lastPlayerEntry: ProtocolEntry | null
} & MatchRoomProjection

export type ActiveProtocolResult = {
  readonly _tag: 'active'
  readonly latestSeq: number
  readonly protocolEntries: readonly ProtocolEntry[]
} & MatchRoomProjection

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
