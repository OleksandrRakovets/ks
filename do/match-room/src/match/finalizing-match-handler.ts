import { isDeepStrictEqual } from 'node:util'

import type { MatchCommand } from '@ks/core'

import type {
  FinishedMatchTransfer,
  GetControlsResult,
  GetProtocolResult,
  GetScoreResult,
  ProtocolReadEntry,
} from '../contracts'
import type { CommandReceipt, StoredFinalizingMatch } from '../storage/definitions'
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

  getControls() {
    this.#warnRead('controls')

    return {
      _tag: 'finalizing' as const,
      state: this.#storedMatch.finalState,
      gameResult: this.#storedMatch.gameResult,
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
    } satisfies Extract<GetControlsResult, { _tag: 'finalizing' }>
  }

  getProtocol() {
    this.#warnRead('protocol')
    // SAFETY: persisted entries were decoded from JSON, so their otherwise-unknown bodies are JSON-safe over RPC.
    const protocolEntries = this.#storage.readProtocol(this.#storedMatch) as readonly ProtocolReadEntry[]

    return {
      _tag: 'finalizing' as const,
      state: this.#storedMatch.finalState,
      gameResult: this.#storedMatch.gameResult,
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      protocolEntries,
    } satisfies Extract<GetProtocolResult, { _tag: 'finalizing' }>
  }

  getScore() {
    this.#warnRead('score')

    return {
      _tag: 'finalizing' as const,
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      score: this.#storedMatch.score,
    } satisfies Extract<GetScoreResult, { _tag: 'finalizing' }>
  }

  prepareArchive(): FinishedMatchTransfer {
    const state = this.#storage.readCurrentState(this.#storedMatch)

    if (!isDeepStrictEqual(state, this.#storedMatch.finalState))
      throw new Error('MatchRoom final state does not match checkpoint projection')

    return {
      matchId: this.#storedMatch.matchId,
      gameKey: this.#storedMatch.config.gameKey,
      createdAt: this.#storedMatch.createdAt,
      sourceLatestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      protocolEntries: this.#storage.readProtocol(this.#storedMatch),
      finalState: this.#storedMatch.finalState,
      gameResult: this.#storedMatch.gameResult,
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

export type FinalizingCommandResult =
  | FinalizingResult
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly endsMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>
