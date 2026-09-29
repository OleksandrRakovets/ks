import {
  correctMatch,
  isCorrectableCommand,
  isCorrectionCommand,
  type Match,
  type MatchStateFor,
  type RegisteredProtocolEntry,
  restoreMatchCheckpoint,
} from '@ks/competition'
import type { Control, MatchCommand, MatchScoreProjection, NonNegativeInteger } from '@ks/core'
import type { GamePresentationFor, RegisteredGameKey } from '@ks/gameplay/definitions'

import { type LiveConnectionCursor, LiveConnectionHandler } from '../live/live-connection-handler'
import { MatchStorage } from '../storage/match-storage'
import type { ActiveMatchRecord, CommandReceipt } from '../storage/records'

export class ActiveMatchHandler {
  readonly #storage: MatchStorage
  readonly #liveConnections: LiveConnectionHandler

  constructor(storage: MatchStorage, liveConnections: LiveConnectionHandler) {
    this.#storage = storage
    this.#liveConnections = liveConnections
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

    return isCorrectionCommand(command)
      ? this.#handleCorrectionCommand(command)
      : this.#handleAdvancingCommand(command)
  }

  #handleAdvancingCommand(command: MatchCommand): ActiveCommandResult {
    const match = restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint())
    const result = match.execute(command)

    if (result._tag !== 'accepted') return this.#handleFailedCommand(command, result)

    const committed = this.#storage.commitAcceptedCommand(
      {
        command: result.command,
        checkpoint: match.exportCheckpoint(),
        state: match.state(),
        protocolEntryContents: result.protocolEntryContents,
      },
      this.#matchRecord.latestSeq,
    )

    this.#liveConnections.broadcast(committed.streamUpdate)

    if (committed.streamUpdate.endsMatch) this.#liveConnections.closeAll()

    return {
      _tag: 'accepted',
      acceptedSeq: committed.receipt.acceptedSeq,
      endsMatch: committed.streamUpdate.endsMatch,
    }
  }

  #handleCorrectionCommand(command: MatchCommand): ActiveCommandResult {
    const target = this.#storage.findCorrectionTarget()

    if (!target)
      return this.#handleFailedCommand(command, {
        _tag: 'rejected',
        reason: { code: 'correction-not-available' },
      })

    const match = restoreMatchCheckpoint(target.previousCheckpoint)
    const result = correctMatch(match, target, command)

    if (result._tag !== 'accepted') return this.#handleFailedCommand(command, result)

    const committed = this.#storage.commitAcceptedCommand(
      {
        command: result.command,
        checkpoint: match.exportCheckpoint(),
        state: match.state(),
        protocolEntryContents: result.protocolEntryContents,
      },
      target.previousCheckpointSeq,
    )

    this.#liveConnections.broadcast(committed.streamUpdate)

    if (committed.streamUpdate.endsMatch) this.#liveConnections.closeAll()

    return {
      _tag: 'accepted',
      acceptedSeq: committed.receipt.acceptedSeq,
      endsMatch: committed.streamUpdate.endsMatch,
    }
  }

  #handleFailedCommand(
    command: MatchCommand,
    result: Exclude<ReturnType<Match['execute']>, { _tag: 'accepted' }>,
  ): ActiveCommandResult {
    // Nested command validation failed before execution, so allow a corrected request to reuse this command ID.
    if (result._tag === 'parse-failed') return { _tag: 'invalid-command' }

    return this.#storage.commitRejectedCommand({
      command,
      reason: result.reason,
    })
  }

  getControls(): ActiveControlsResult {
    const match = restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint())
    const lastCommand = this.#storage.findLastAdvancingPlayerCommand()

    const presentedLastCommand =
      lastCommand && isCorrectableCommand(lastCommand.command)
        ? {
            entry: lastCommand.entry,
            correction: {
              source: 'match',
              type: 'command.correct',
              fixedInput: {
                targetSeq: lastCommand.entry.acceptedSeq,
                targetCommandId: lastCommand.command.commandId,
              },
              prominence: 'secondary',
            } satisfies Control,
          }
        : lastCommand && { entry: lastCommand.entry }

    return {
      _tag: 'active',
      latestSeq: this.#matchRecord.latestSeq,
      ...presentationOf(match),
      controls: match.controls(),
      lastCommand: presentedLastCommand,
    }
  }

  getProtocol(): ActiveProtocolResult {
    const match = restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint())

    return {
      _tag: 'active',
      latestSeq: this.#matchRecord.latestSeq,
      ...presentationOf(match),
      protocolEntries: this.#storage.readProtocol(),
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

  get #matchRecord(): ActiveMatchRecord {
    return this.#storage.activeMatchRecord
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
  readonly lastCommand: {
    readonly entry: RegisteredProtocolEntry
    readonly correction?: Control
  } | null
} & ActivePresentation

type ActiveProtocolResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly protocolEntries: readonly RegisteredProtocolEntry[]
} & ActivePresentation

type ActiveScoreResult = {
  readonly _tag: 'active'
  readonly latestSeq: NonNegativeInteger
  readonly score: MatchScoreProjection
}
