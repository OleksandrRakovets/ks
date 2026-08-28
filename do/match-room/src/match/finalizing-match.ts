import { Broadcaster } from '../live/broadcaster'
import { type FinalizingTransfer, MatchStorage } from '../storage/match-storage'

export class FinalizingMatch {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster

  constructor(storage: MatchStorage, broadcaster: Broadcaster) {
    this.#storage = storage
    this.#broadcaster = broadcaster
  }

  prepareArchive(): FinalizingTransfer {
    const match = this.#storage.match()
    if (!match) throw new Error('FinalizingMatch storage missing')
    if (match.status === 'active') throw new Error('Cannot prepare archive for active Match')
    return this.#storage.readFinalizingTransfer()
  }

  closeForDisposal(): CloseForDisposalResult {
    const match = this.#storage.match()
    if (!match) return { _tag: 'already-disposed' }
    if (match.status === 'active') throw new Error('Cannot dispose active Match')
    this.#storage.readFinalizingTransfer()
    this.#broadcaster.broadcast({ type: 'command-accepted', acceptedSeq: match.latestSeq, terminal: true })
    this.#broadcaster.closeAll()
    return { _tag: 'closed' }
  }
}

export type CloseForDisposalResult = { readonly _tag: 'already-disposed' } | { readonly _tag: 'closed' }
