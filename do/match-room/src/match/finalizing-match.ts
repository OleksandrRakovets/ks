import { Broadcaster } from '../live/broadcaster'
import { type FinalizingTransfer, MatchStorage } from '../storage/match-storage'

export class FinalizingMatch {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster

  constructor(storage: MatchStorage, broadcaster: Broadcaster) {
    this.#storage = storage
    this.#broadcaster = broadcaster
  }

  prepareArchive(): PrepareArchiveResult {
    const match = this.#storage.match()
    if (!match) return { _tag: 'missing' }
    if (match.status === 'active') return { _tag: 'active' }
    return { _tag: 'prepared', transfer: this.#storage.readFinalizingTransfer() }
  }

  closeForDisposal(): CloseForDisposalResult {
    const match = this.#storage.match()
    if (!match) return { _tag: 'already-disposed' }
    if (match.status === 'active') return { _tag: 'active' }
    this.#storage.readFinalizingTransfer()
    this.#broadcaster.broadcast({ type: 'command-accepted', acceptedSeq: match.latestSeq, terminal: true })
    this.#broadcaster.closeAll()
    return { _tag: 'closed' }
  }
}

export type PrepareArchiveResult =
  | { readonly _tag: 'missing' }
  | { readonly _tag: 'active' }
  | { readonly _tag: 'prepared'; readonly transfer: FinalizingTransfer }

export type CloseForDisposalResult =
  | { readonly _tag: 'already-disposed' }
  | { readonly _tag: 'active' }
  | { readonly _tag: 'closed' }
