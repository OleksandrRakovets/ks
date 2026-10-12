import type { UnixEpochMilliseconds } from '@ks/core'

/** A soft-deleted room exposes only its tombstone, never gameplay or history. */
export class DiscardedMatchHandler {
  readonly #endedAt: UnixEpochMilliseconds

  constructor(endedAt: UnixEpochMilliseconds) {
    this.#endedAt = endedAt
  }

  discard() {
    return { _tag: 'discarded' as const, endedAt: this.#endedAt }
  }

  submitCommand() {
    return { _tag: 'discarded' as const, endedAt: this.#endedAt }
  }

  getControls() {
    return { _tag: 'discarded' as const }
  }

  getProtocol() {
    return { _tag: 'discarded' as const }
  }

  getScore() {
    return { _tag: 'discarded' as const }
  }
}
