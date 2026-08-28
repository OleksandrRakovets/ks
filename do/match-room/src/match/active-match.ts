import { restoreSparringMatch, type SparringMatch, type SparringMatchRoomProjection } from '@ks/competition'
import type { MatchStreamUpdate, ProtocolEntry } from '@ks/core'

import { Broadcaster } from '../live/broadcaster'
import { type ActiveMatchRecord, MatchStorage } from '../storage/match-storage'

export class ActiveMatch {
  private readonly storage: MatchStorage
  private readonly broadcaster: Broadcaster
  private resident: ResidentMatch | null = null

  constructor(storage: MatchStorage, broadcaster: Broadcaster) {
    this.storage = storage
    this.broadcaster = broadcaster
  }

  getControls(): ActiveControlsResult {
    const match = this.storage.match()
    if (!match) return { _tag: 'missing' }
    if (match.status === 'finalizing') return { _tag: 'finalizing' }
    return { _tag: 'active', latestSeq: match.latestSeq, projection: this.loadResident(match).match.project() }
  }

  getProtocol(): ActiveProtocolResult {
    const match = this.storage.match()
    if (!match) return { _tag: 'missing' }
    if (match.status === 'finalizing') return { _tag: 'finalizing' }
    const protocol = this.storage.readProtocol()
    return {
      _tag: 'active',
      latestSeq: protocol.latestSeq,
      state: this.loadResident(match).match.project().state,
      protocolEntries: protocol.protocolEntries,
    }
  }

  // Temporary command bridge until command orchestration moves into ActiveMatch.
  loadResident(match: ActiveMatchRecord): ResidentMatch {
    if (this.resident?.latestSeq === match.latestSeq) return this.resident
    const resident = restoreSparringMatch(match.config, this.storage.readAcceptedCommandHistory())
    return (this.resident = { latestSeq: match.latestSeq, match: resident })
  }

  advanceResidentCursor(acceptedSeq: number): void {
    if (!this.resident) throw new Error('ActiveMatch resident missing after accepted Command')
    this.resident = { ...this.resident, latestSeq: acceptedSeq }
  }

  broadcast(update: MatchStreamUpdate): void {
    this.broadcaster.broadcast(update)
  }

  clearResident(): void {
    this.resident = null
  }
}

type ResidentMatch = { readonly latestSeq: number; readonly match: SparringMatch }

export type ActiveControlsResult =
  | { readonly _tag: 'missing' }
  | { readonly _tag: 'finalizing' }
  | {
      readonly _tag: 'active'
      readonly latestSeq: number
      readonly projection: SparringMatchRoomProjection
    }

export type ActiveProtocolResult =
  | { readonly _tag: 'missing' }
  | { readonly _tag: 'finalizing' }
  | {
      readonly _tag: 'active'
      readonly latestSeq: number
      readonly state: SparringMatchRoomProjection['state']
      readonly protocolEntries: ProtocolEntry[]
    }
