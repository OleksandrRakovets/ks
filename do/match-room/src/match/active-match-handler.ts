import type { Match, MatchStateFor } from '@ks/competition'
import type { Control, MatchCommand, MatchScoreProjection, NonNegativeInteger, ProtocolEntry } from '@ks/core'
import type { GamePresentationFor, RegisteredGameKey } from '@ks/gameplay/definitions'

import { type LiveConnectionCursor, LiveConnectionHandler } from '../live/live-connection-handler'
import { MatchStorage } from '../storage/match-storage'
import type { ActiveMatchRecord, CommandReceipt } from '../storage/records'
import { restoreMatch } from './restore-match'

export class ActiveMatchHandler {
  readonly #storage: MatchStorage
  readonly #liveConnections: LiveConnectionHandler
  readonly #matchRecord: ActiveMatchRecord

  constructor(storage: MatchStorage, liveConnections: LiveConnectionHandler) {
    const matchRecord = storage.matchRecord()

    if (matchRecord?.status !== 'active') throw new Error('Active Match record required')

    this.#storage = storage
    this.#liveConnections = liveConnections
    this.#matchRecord = matchRecord
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

    const match = restoreMatch(this.#storage, this.#matchRecord)
    const result = match.execute(command)

    // Nested command validation failed before execution, so allow a corrected request to reuse this command ID.
    if (result._tag === 'parse-failed') return { _tag: 'invalid-command' }

    if (result._tag === 'rejected')
      return this.#storage.commitRejectedCommand({
        matchId: this.#matchRecord.matchId,
        command,
        reason: result.reason,
      })

    const committed = this.#storage.commitAcceptedCommand({
      matchRecord: this.#matchRecord,
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
    const match = restoreMatch(this.#storage, this.#matchRecord)

    return {
      _tag: 'active',
      latestSeq: this.#matchRecord.latestSeq,
      ...presentationOf(match),
      controls: match.controls(),
      lastPlayerEntry: this.#storage.readLastPlayerEntry(this.#matchRecord),
    }
  }

  getProtocol(): ActiveProtocolResult {
    const match = restoreMatch(this.#storage, this.#matchRecord)

    return {
      _tag: 'active',
      latestSeq: this.#matchRecord.latestSeq,
      ...presentationOf(match),
      protocolEntries: this.#storage.readProtocol(this.#matchRecord),
    }
  }

  getScore(): ActiveScoreResult {
    return {
      _tag: 'active',
      latestSeq: this.#matchRecord.latestSeq,
      score: this.#matchRecord.score,
    }
  }

  liveConnectionCursor(): LiveConnectionCursor {
    return { matchId: this.#matchRecord.matchId, latestSeq: this.#matchRecord.latestSeq }
  }
}

type ActivePresentationFor<K extends RegisteredGameKey> = {
  readonly state: MatchStateFor<K>
  readonly game: GamePresentationFor<K> | undefined
}

/**
 * Mapping before indexing forms a union whose state and game share one game key. Match's independent query return
 * types otherwise widen both values to every registered game and lose that correlation at this response boundary.
 */
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
