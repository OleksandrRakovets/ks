import {
  type MatchScoreProjection,
  type MatchState,
  type ProtocolEntry,
  restoreMatchCheckpoint,
} from '@ks/competition'
import type { MatchCommand, MatchId, NonNegativeInteger, UnixEpochMilliseconds } from '@ks/core'
import type { GameKey, GameResult } from '@ks/gameplay/definitions'

import { MatchStorage } from '../storage/match-storage'
import type { CommandReceipt, FinalizingMatchRecord } from '../storage/records'

export class FinalizingMatchHandler {
  readonly #storage: MatchStorage

  constructor(storage: MatchStorage) {
    this.#storage = storage
  }

  submitCommand(command: typeof MatchCommand.Type): FinalizingCommandResult {
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

    return {
      _tag: 'finalizing' as const,
      ...this.#readFinishedMatch(),
      latestSeq: this.#matchRecord.latestSeq,
      endedAt: this.#matchRecord.endedAt,
    }
  }

  getProtocol(): FinalizingProtocolResult {
    this.#warnRead('protocol')

    return {
      _tag: 'finalizing' as const,
      ...this.#readFinishedMatch(),
      latestSeq: this.#matchRecord.latestSeq,
      endedAt: this.#matchRecord.endedAt,
      protocolEntries: this.#storage.readProtocol(),
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
    const { state, gameResult } = this.#readFinishedMatch()

    return {
      matchId: this.#matchRecord.matchId,
      gameKey: this.#matchRecord.config.gameKey,
      createdAt: this.#matchRecord.createdAt,
      sourceLatestSeq: this.#matchRecord.latestSeq,
      endedAt: this.#matchRecord.endedAt,
      protocolEntries: this.#storage.readProtocol(),
      finalState: state,
      gameResult,
    }
  }

  #readFinishedMatch() {
    const match = restoreMatchCheckpoint(this.#storage.readCurrentCheckpoint())
    const state = match.state()

    if (state.status !== 'finished') throw new Error('Expected finished Match')

    return { state, gameResult: match.gameResult() }
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

  get #matchRecord(): FinalizingMatchRecord {
    return this.#storage.finalizingMatchRecord
  }
}

type FinalizingResult = { readonly _tag: 'finalizing' }

type FinalizingReadResult = {
  readonly _tag: 'finalizing'
  readonly state: Extract<typeof MatchState.Type, { status: 'finished' }>
  readonly gameResult: typeof GameResult.Type | null
  readonly latestSeq: typeof NonNegativeInteger.Type
  readonly endedAt: typeof UnixEpochMilliseconds.Type
}

type FinalizingProtocolResult = FinalizingReadResult & {
  readonly protocolEntries: readonly (typeof ProtocolEntry.Type)[]
}

type FinalizingScoreResult = {
  readonly _tag: 'finalizing'
  readonly latestSeq: typeof NonNegativeInteger.Type
  readonly endedAt: typeof UnixEpochMilliseconds.Type
  readonly score: typeof MatchScoreProjection.Type
}

export type FinishedMatchTransfer = {
  readonly matchId: typeof MatchId.Type
  readonly gameKey: typeof GameKey.Type
  readonly createdAt: typeof UnixEpochMilliseconds.Type
  readonly sourceLatestSeq: typeof NonNegativeInteger.Type
  readonly endedAt: typeof UnixEpochMilliseconds.Type
  readonly protocolEntries: readonly (typeof ProtocolEntry.Type)[]
  readonly finalState: Extract<typeof MatchState.Type, { status: 'finished' }>
  readonly gameResult: typeof GameResult.Type | null
}

export type FinalizingCommandResult =
  | FinalizingResult
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly endsMatch: boolean
    }
  | Extract<typeof CommandReceipt.Type, { _tag: 'rejected' }>
