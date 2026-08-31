import { restoreSparringMatch, type SparringMatch, type SparringMatchRoomProjection } from '@ks/competition'
import type { MatchCommand, MatchStreamUpdate, ProtocolEntry } from '@ks/core'

import { Broadcaster } from '../live/broadcaster'
import { type ActiveMatchRecord, type CommandReceipt, MatchStorage } from '../storage/match-storage'

export class ActiveMatch {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  #resident: ResidentMatch | null = null

  constructor(storage: MatchStorage, broadcaster: Broadcaster) {
    this.#storage = storage
    this.#broadcaster = broadcaster
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

    const resident = this.#loadResident(match)
    try {
      const result = resident.match.execute(command)
      if (result._tag === 'parse-failed') return { _tag: 'invalid-command' }
      if (result._tag === 'rejected') {
        const receipt = this.#storage.commitRejectedCommand({
          matchId: match.matchId,
          command,
          reason: result.reason,
        })
        return receipt
      }

      const projection = resident.match.project()
      const finalState = projection.state.status === 'finished' ? projection.state : null
      const committed = this.#storage.commitAcceptedCommand({
        match,
        command: result.command,
        entryContents: result.protocolEntryContents,
        finalState,
      })
      this.#advanceResidentCursor(committed.receipt.acceptedSeq)
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
      this.clearResident()
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
      ...this.#loadResident(match).match.project(),
    }
  }

  getProtocol(): ActiveProtocolResult {
    const match = this.#storage.match()
    if (!match) throw new Error('ActiveMatch storage missing')
    if (match.status === 'finalizing') return { _tag: 'finalizing' }
    const protocol = this.#storage.readProtocol()
    return {
      _tag: 'active',
      latestSeq: protocol.latestSeq,
      state: this.#loadResident(match).match.project().state,
      protocolEntries: protocol.protocolEntries,
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

  clearResident(): void {
    this.#resident = null
  }

  #loadResident(match: ActiveMatchRecord): ResidentMatch {
    if (this.#resident?.latestSeq === match.latestSeq) return this.#resident
    const resident = restoreSparringMatch(match.config, this.#storage.readAcceptedCommandHistory())
    return (this.#resident = { latestSeq: match.latestSeq, match: resident })
  }

  #advanceResidentCursor(acceptedSeq: number): void {
    if (!this.#resident) throw new Error('ActiveMatch resident missing after accepted Command')
    this.#resident = { ...this.#resident, latestSeq: acceptedSeq }
  }
}

type ResidentMatch = { readonly latestSeq: number; readonly match: SparringMatch }

export type ActiveControlsResult =
  | { readonly _tag: 'finalizing' }
  | ({ readonly _tag: 'active'; readonly latestSeq: number } & SparringMatchRoomProjection)

export type ActiveProtocolResult =
  | { readonly _tag: 'finalizing' }
  | {
      readonly _tag: 'active'
      readonly latestSeq: number
      readonly state: SparringMatchRoomProjection['state']
      readonly protocolEntries: ProtocolEntry[]
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
