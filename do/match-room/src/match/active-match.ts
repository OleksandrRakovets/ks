import type { SparringMatchRoomProjection } from '@ks/competition'
import type { MatchCommand, MatchStreamUpdate, ProtocolEntry } from '@ks/core'

import { Broadcaster } from '../live/broadcaster'
import { type CommandReceipt, MatchStorage } from '../storage/match-storage'
import { MatchResident } from './match-resident'

export class ActiveMatch {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #resident: MatchResident

  constructor(storage: MatchStorage, broadcaster: Broadcaster, resident: MatchResident) {
    this.#storage = storage
    this.#broadcaster = broadcaster
    this.#resident = resident
  }

  submitCommand(command: MatchCommand): ActiveCommandResult {
    const match = this.#storage.match()
    if (!match) throw new Error('ActiveMatch storage missing')
    const prior = this.#storage.findCommandReceipt(command)
    if (prior) {
      if (prior._tag === 'command-id-conflict') return prior
      return prior.receipt._tag === 'accepted'
        ? {
            _tag: 'accepted',
            acceptedSeq: prior.receipt.acceptedSeq,
            finalizesMatch: match.status === 'finalizing' && prior.receipt.acceptedSeq === match.latestSeq,
          }
        : prior.receipt
    }
    if (match.status === 'finalizing') return { _tag: 'finalizing' }

    try {
      const result = this.#resident.executeAndCommit(match, command)
      if (result._tag === 'parse-failed') return { _tag: 'invalid-command' }
      if (result._tag === 'rejected') {
        const receipt = this.#storage.commitRejectedCommand({
          matchId: match.matchId,
          command,
          reason: result.reason,
        })
        return receipt
      }

      const { committed } = result
      if (!committed.update.terminal) {
        // Terminal is withheld during D1 archival; the browser updates after finalization broadcasts, closes, and revalidates.
        this.#broadcaster.broadcast(committed.update)
      }
      return {
        _tag: 'accepted',
        acceptedSeq: committed.receipt.acceptedSeq,
        finalizesMatch: committed.update.terminal,
      }
    } catch (error) {
      this.#resident.clear()
      throw error
    }
  }

  getControls(): ActiveControlsResult {
    const match = this.#storage.match()
    if (!match) throw new Error('ActiveMatch storage missing')
    if (match.status === 'finalizing') return { _tag: 'finalizing' }
    return {
      _tag: 'active',
      latestSeq: match.latestSeq,
      ...this.#resident.load(match).match.project(),
    }
  }

  getProtocol(): ActiveProtocolResult {
    const match = this.#storage.match()
    if (!match) throw new Error('ActiveMatch storage missing')
    if (match.status === 'finalizing') return { _tag: 'finalizing' }
    const resident = this.#resident.load(match)
    return {
      _tag: 'active',
      latestSeq: resident.latestSeq,
      state: resident.match.project().state,
      protocolEntries: resident.protocolEntries,
    }
  }

  stream(since = 0): ActiveStreamResult {
    const match = this.#storage.match()
    if (!match) throw new Error('ActiveMatch storage missing')
    if (match.status === 'finalizing') return { _tag: 'finalizing' }
    const backlog: MatchStreamUpdate[] = []
    for (let acceptedSeq = since + 1; acceptedSeq <= match.latestSeq; acceptedSeq += 1)
      backlog.push({ type: 'command-accepted', acceptedSeq, terminal: false })
    return { _tag: 'active', response: this.#broadcaster.stream(match.latestSeq, backlog) }
  }
}

export type ActiveControlsResult =
  | { readonly _tag: 'finalizing' }
  | ({ readonly _tag: 'active'; readonly latestSeq: number } & SparringMatchRoomProjection)

export type ActiveProtocolResult =
  | { readonly _tag: 'finalizing' }
  | {
      readonly _tag: 'active'
      readonly latestSeq: number
      readonly state: SparringMatchRoomProjection['state']
      readonly protocolEntries: readonly ProtocolEntry[]
    }

export type ActiveCommandResult =
  | { readonly _tag: 'finalizing' }
  | { readonly _tag: 'invalid-command' }
  | { readonly _tag: 'command-id-conflict' }
  | {
      readonly _tag: 'accepted'
      readonly acceptedSeq: number
      readonly finalizesMatch: boolean
    }
  | Extract<CommandReceipt, { _tag: 'rejected' }>

export type ActiveStreamResult =
  | { readonly _tag: 'finalizing' }
  | { readonly _tag: 'active'; readonly response: Response }
