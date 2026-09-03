import { isDeepStrictEqual } from 'node:util'

import { Broadcaster } from '../live/broadcaster'
import { MatchStorage } from '../storage/match-storage'
import { MatchResident } from './match-resident'

export class FinalizingMatch {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #resident: MatchResident

  constructor(storage: MatchStorage, broadcaster: Broadcaster, resident: MatchResident) {
    this.#storage = storage
    this.#broadcaster = broadcaster
    this.#resident = resident
  }

  prepareArchive() {
    const match = this.#storage.match()
    if (!match) throw new Error('FinalizingMatch storage missing')
    if (match.status === 'active') throw new Error('Cannot prepare archive for active Match')
    if (!match.finalState || match.endedAt === null) throw new Error('Finalizing Match terminal data missing')
    const resident = this.#resident.load(match)
    const projected = resident.match.project().state
    const terminal = resident.protocolEntries.filter((entry) => entry.entryType === 'match-ended')
    const tail = resident.protocolEntries.at(-1)
    const winner = [...projected.frames].reverse().find((frame) => frame.winnerSeat)?.winnerSeat
    if (
      !tail ||
      terminal.length !== 1 ||
      tail !== terminal[0] ||
      tail.acceptedSeq !== match.latestSeq ||
      tail.acceptedAt !== match.endedAt ||
      tail.seat !== winner ||
      !isDeepStrictEqual(projected, match.finalState)
    )
      throw new Error('MatchRoom terminal semantic corruption')
    return {
      matchId: match.matchId,
      gameKey: match.config.gameKey,
      createdAt: match.createdAt,
      sourceLatestSeq: match.latestSeq,
      endedAt: match.endedAt,
      protocolEntries: resident.protocolEntries,
      finalState: match.finalState,
    }
  }

  closeForFinalization(): FinalizationResult {
    const match = this.#storage.match()
    if (!match) return { _tag: 'already-disposed' }
    if (match.status === 'active') throw new Error('Cannot finalize active Match')
    this.#broadcaster.broadcast({ type: 'command-accepted', acceptedSeq: match.latestSeq, terminal: true })
    this.#broadcaster.closeAll()
    return { _tag: 'finalized' }
  }

  prepareDisposal(): DisposalResult {
    const match = this.#storage.match()
    if (!match) return { _tag: 'already-disposed' }
    if (match.status === 'active') throw new Error('Cannot dispose active Match')
    return { _tag: 'ready' }
  }
}

type FinalizationResult = { readonly _tag: 'already-disposed' } | { readonly _tag: 'finalized' }
type DisposalResult = { readonly _tag: 'already-disposed' } | { readonly _tag: 'ready' }
