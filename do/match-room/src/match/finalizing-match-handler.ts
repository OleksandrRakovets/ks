import { isDeepStrictEqual } from 'node:util'

import type {
  MatchCommand,
  MatchId,
  MatchState,
  NonNegativeInteger,
  ProtocolEntry,
  UnixEpochMilliseconds,
} from '@ks/core'
import { projectMatchScore } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'

import { type CommandReceipt, MatchStorage, type StoredFinalizingMatch } from '../storage/match-storage'
import { ResidentMatch, type ResidentState } from './resident-match'

export class FinalizingMatchHandler {
  readonly #storage: MatchStorage
  readonly #storedMatch: StoredFinalizingMatch
  #resident: ResidentMatch | null

  constructor(
    storage: MatchStorage,
    storedMatch: StoredFinalizingMatch,
    resident: ResidentMatch | null = null,
  ) {
    this.#storage = storage
    this.#storedMatch = storedMatch
    this.#resident = resident
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
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
    }
  }

  getProtocol() {
    this.#warnRead('protocol')

    return {
      _tag: 'finalizing' as const,
      state: this.#storedMatch.finalState,
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
    }
  }

  getScore() {
    this.#warnRead('score')

    return {
      _tag: 'finalizing' as const,
      latestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      score: projectMatchScore(this.#storedMatch.finalState),
    }
  }

  prepareArchive(): FinishedMatchTransfer {
    const resident = this.#load()
    const projected = resident.match.project().state

    if (!isDeepStrictEqual(projected, this.#storedMatch.finalState))
      throw new Error('MatchRoom final state does not match accepted history')

    return {
      matchId: this.#storedMatch.matchId,
      gameKey: this.#storedMatch.config.gameKey,
      createdAt: this.#storedMatch.createdAt,
      sourceLatestSeq: this.#storedMatch.latestSeq,
      endedAt: this.#storedMatch.endedAt,
      protocolEntries: resident.protocolEntries,
      finalState: this.#storedMatch.finalState,
    }
  }

  finalize(): void {
    this.#resident?.clear()
    this.#resident = null
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

  #load(): ResidentState {
    const resident = this.#resident ?? new ResidentMatch()
    this.#resident = resident

    return (
      resident.lookup(this.#storedMatch.latestSeq) ??
      resident.restore(
        this.#storedMatch.config,
        this.#storedMatch.latestSeq,
        this.#storage.readAcceptedCommands(this.#storedMatch),
      )
    )
  }
}

export type FinalizingResult = { readonly _tag: 'finalizing' }

export type FinalizingCommandResult =
  | FinalizingResult
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly endsMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>

export type FinishedMatchTransfer = {
  readonly matchId: MatchId
  readonly gameKey: RegisteredGameKey
  readonly createdAt: UnixEpochMilliseconds
  readonly sourceLatestSeq: NonNegativeInteger
  readonly endedAt: UnixEpochMilliseconds
  readonly protocolEntries: readonly ProtocolEntry[]
  readonly finalState: MatchState
}
