import { type Match, restoreMatchCheckpoint } from '@ks/competition'
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

import type { CommandReceipt, StoredFinalizingMatch } from '../storage/codecs'
import { MatchStorage } from '../storage/match-storage'

export class FinalizingMatchHandler {
  readonly #storage: MatchStorage
  readonly #storedMatch: StoredFinalizingMatch

  constructor(storage: MatchStorage, storedMatch: StoredFinalizingMatch) {
    this.#storage = storage
    this.#storedMatch = storedMatch
  }

  submitCommand(command: MatchCommand): FinalizingCommandResult {
    const prior = this.#storage.findCommandReceipt(command)

    if (!prior) return { _tag: 'finalizing' }

    if (prior._tag === 'command-id-conflict') return prior

    if (prior.receipt._tag === 'rejected') return prior.receipt

    return {
      _tag: 'accepted',
      acceptedSeq: prior.receipt.acceptedSeq,
      endsMatch: prior.receipt.acceptedSeq === this.#storedMatch.latestSeq,
    }
  }

  getControls(): FinalizingReadResult {
    this.#warnRead('controls')
    const match = this.#restoreMatch()

    return {
      _tag: 'finalizing' as const,
      state: match.project().state,
      gameResult: match.gameResult(),
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
    }
  }

  getProtocol(): FinalizingProtocolResult {
    this.#warnRead('protocol')
    const match = this.#restoreMatch()

    return {
      _tag: 'finalizing' as const,
      state: match.project().state,
      gameResult: match.gameResult(),
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      protocolEntries: this.#storage.readProtocol(this.#storedMatch),
    }
  }

  getScore(): FinalizingScoreResult {
    this.#warnRead('score')

    return {
      _tag: 'finalizing' as const,
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      score: this.#storedMatch.score,
    }
  }

  prepareArchive(): FinishedMatchTransfer {
    const match = this.#restoreMatch()

    return {
      matchId: this.#storedMatch.matchId,
      gameKey: this.#storedMatch.config.gameKey,
      createdAt: this.#storedMatch.createdAt,
      sourceLatestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      protocolEntries: this.#storage.readProtocol(this.#storedMatch),
      finalState: match.project().state,
      gameResult: match.gameResult(),
    }
  }

  #restoreMatch(): Match {
    try {
      return restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint(this.#storedMatch))
    } catch (cause) {
      throw new Error('MatchRoom checkpoint storage corruption', { cause })
    }
  }

  #warnRead(kind: 'controls' | 'protocol' | 'score'): void {
    console.warn({
      event: 'match-room.finalizing-read',
      matchId: this.#storedMatch.matchId,
      kind,
      endedAt: this.#storedMatch.endedAt,
      ageMs: Math.max(0, Date.now() - this.#storedMatch.endedAt),
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
