import { restoreMatchCheckpoint } from '@ks/competition'
import type {
  MatchCommand,
  MatchId,
  MatchScoreProjection,
  MatchState,
  NonNegativeInteger,
  ProtocolEntry,
  UnixEpochMilliseconds,
} from '@ks/core'
import type { GameResult, RegisteredGameKey } from '@ks/gameplay/definitions'

import { MatchStorage } from '../storage/match-storage'
import type { CommandReceipt, FinalizingMatchRecord } from '../storage/records'

export class FinalizingMatchHandler {
  readonly #storage: MatchStorage
  readonly #matchRecord: FinalizingMatchRecord

  constructor(storage: MatchStorage) {
    const matchRecord = storage.matchRecord()

    if (matchRecord?.status !== 'finalizing') throw new Error('Finalizing Match record required')

    this.#storage = storage
    this.#matchRecord = matchRecord
  }

  submitCommand(command: MatchCommand): FinalizingCommandResult {
    const prior = this.#storage.findCommandReceipt(command)

    if (!prior) return { _tag: 'finalizing' }

    if (prior._tag === 'command-id-conflict') return prior

    if (prior.receipt._tag === 'rejected') return prior.receipt

    return {
      _tag: 'accepted',
      acceptedSeq: prior.receipt.acceptedSeq,
      endsMatch: prior.receipt.acceptedSeq === this.#matchRecord.latestSeq,
    }
  }

  getControls(): FinalizingReadResult {
    this.#warnRead('controls')
    const match = restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint(this.#matchRecord))

    return {
      _tag: 'finalizing' as const,
      state: match.state(),
      gameResult: match.gameResult(),
      latestSeq: this.#matchRecord.latestSeq,
      endedAt: this.#matchRecord.endedAt,
    }
  }

  getProtocol(): FinalizingProtocolResult {
    this.#warnRead('protocol')
    const match = restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint(this.#matchRecord))

    return {
      _tag: 'finalizing' as const,
      state: match.state(),
      gameResult: match.gameResult(),
      latestSeq: this.#matchRecord.latestSeq,
      endedAt: this.#matchRecord.endedAt,
      protocolEntries: this.#storage.readProtocol(this.#matchRecord),
    }
  }

  getScore(): FinalizingScoreResult {
    this.#warnRead('score')

    return {
      _tag: 'finalizing' as const,
      latestSeq: this.#matchRecord.latestSeq,
      endedAt: this.#matchRecord.endedAt,
      score: this.#matchRecord.score,
    }
  }

  prepareArchive(): FinishedMatchTransfer {
    const match = restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint(this.#matchRecord))

    return {
      matchId: this.#matchRecord.matchId,
      gameKey: this.#matchRecord.config.gameKey,
      createdAt: this.#matchRecord.createdAt,
      sourceLatestSeq: this.#matchRecord.latestSeq,
      endedAt: this.#matchRecord.endedAt,
      protocolEntries: this.#storage.readProtocol(this.#matchRecord),
      finalState: match.state(),
      gameResult: match.gameResult(),
    }
  }

  #warnRead(kind: 'controls' | 'protocol' | 'score'): void {
    console.warn({
      event: 'match-room.finalizing-read',
      matchId: this.#matchRecord.matchId,
      kind,
      endedAt: this.#matchRecord.endedAt,
      ageMs: Math.max(0, Date.now() - this.#matchRecord.endedAt),
    })
  }
}

type FinalizingResult = { readonly _tag: 'finalizing' }

type FinalizingReadResult = {
  readonly _tag: 'finalizing'
  readonly state: MatchState
  readonly gameResult: GameResult | null
  readonly latestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
}

type FinalizingProtocolResult = FinalizingReadResult & {
  readonly protocolEntries: readonly ProtocolEntry[]
}

type FinalizingScoreResult = {
  readonly _tag: 'finalizing'
  readonly latestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
  readonly score: MatchScoreProjection
}

export type FinishedMatchTransfer = {
  readonly matchId: MatchId
  readonly gameKey: RegisteredGameKey
  readonly createdAt: UnixEpochMilliseconds
  readonly sourceLatestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
  readonly protocolEntries: readonly ProtocolEntry[]
  readonly finalState: MatchState
  readonly gameResult: GameResult | null
}

export type FinalizingCommandResult =
  | FinalizingResult
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly endsMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>
