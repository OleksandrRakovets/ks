import { watchBrowserReturn } from '@/features/freshness/browser-return'

export type LiveListSchedulerOptions = {
  readonly readScores: (signal: AbortSignal) => Promise<void>
  readonly readFullList: () => Promise<void>
  readonly hasScores: () => boolean
}

const SCORE_INTERVAL_MS = 30_000

const MEMBERSHIP_INTERVAL_MS = 60_000

const SCORE_TIMEOUT_MS = 10_000

/**
 * Coordinates the two live-list reads and browser lifecycle signals.
 *
 * The controller deliberately owns one timer: a full loader read dominates a
 * score read whenever both deadlines are due because the loader supplies both
 * membership and authoritative scores. The membership deadline also removes
 * recent results once they leave the server's live window, at most one interval
 * late. Deadlines are absolute local instants, so a throttled or suspended tab
 * catches up rather than accumulating interval drift.
 */
export class LiveListController {
  readonly #options: LiveListSchedulerOptions
  #timer?: number
  #stopWatchingBrowser?: () => void
  #scoreAbort?: AbortController
  #cancelScore?: () => void
  #fullGeneration?: number
  #generation = 0
  #disposed = false
  #pageHidden = false
  #catchingUp = false
  #pendingFull = false
  #scoreDueAt: number
  #membershipDueAt: number

  constructor(options: LiveListSchedulerOptions) {
    this.#options = options
    const now = Date.now()
    this.#scoreDueAt = now + SCORE_INTERVAL_MS
    this.#membershipDueAt = now + MEMBERSHIP_INTERVAL_MS
  }

  /** Starts deadlines and installs all document/window lifecycle listeners. */
  start(): void {
    this.#stopWatchingBrowser = watchBrowserReturn({
      onHide: () => this.#hide(),
      onReturn: () => this.#resume(),
    })
    this.#schedule()
  }

  /**
   * Records a committed list projection and rereads score availability without restarting
   * periodic deadlines. Call when pollable rows change.
   */
  snapshot(): void {
    this.#schedule()
  }

  /**
   * Requests authoritative membership now. Repeated demands coalesce while the
   * same full read is underway, and that read cancels any explicit score fetch.
   */
  demandFullRead(): void {
    this.#pendingFull = true
    this.#schedule()
  }

  /** Synchronously stops timers, aborts explicit score I/O, and removes listeners. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#generation++
    this.#stopWork()
    this.#stopWatchingBrowser?.()
  }

  #hide() {
    this.#pageHidden = true
    this.#generation++
    this.#fullGeneration = undefined
    this.#catchingUp = false
    this.#stopWork()
  }

  #resume() {
    if (this.#disposed) return
    this.#pageHidden = false

    if (this.#catchingUp) return
    this.#catchingUp = true
    this.#generation++
    this.#fullGeneration = undefined
    // A pre-hide Router revalidation may still settle, but its generation was
    // invalidated. The replacement read is the only one allowed to schedule work.
    void this.#readFull()
  }

  #schedule() {
    this.#clearTimer()

    if (!this.#isForeground() || this.#fullGeneration !== undefined) return
    const now = Date.now()

    if (this.#pendingFull || this.#membershipDueAt <= now) {
      void this.#readFull()

      return
    }

    const canPollScores = this.#options.hasScores() && this.#scoreAbort === undefined

    if (canPollScores && this.#scoreDueAt <= now) {
      void this.#readScores()

      return
    }

    // While a score GET is pending the membership wake-up remains armed, so it can preempt slow
    // scores rather than waiting for their network completion or timeout.
    const next = Math.min(this.#membershipDueAt, canPollScores ? this.#scoreDueAt : Infinity)

    this.#timer = window.setTimeout(() => this.#schedule(), Math.max(0, next - now))
  }

  async #readFull() {
    if (!this.#isForeground() || this.#fullGeneration !== undefined) return
    this.#abortScores()
    const generation = this.#generation
    this.#fullGeneration = generation
    this.#pendingFull = false
    let succeeded = false

    try {
      await this.#options.readFullList()
      succeeded = true
    } catch {
      // Router loader errors may replace the page with its error boundary. If still mounted,
      // retry on the membership cadence.
    }

    if (this.#disposed || generation !== this.#generation || this.#fullGeneration !== generation) return
    this.#fullGeneration = undefined
    this.#catchingUp = false
    const now = Date.now()
    this.#membershipDueAt = now + MEMBERSHIP_INTERVAL_MS

    if (succeeded) this.#scoreDueAt = now + SCORE_INTERVAL_MS
    this.#schedule()
  }

  async #readScores() {
    if (!this.#isForeground() || this.#scoreAbort !== undefined || !this.#options.hasScores()) return
    const generation = this.#generation
    const controller = new AbortController()
    this.#scoreAbort = controller
    this.#schedule()
    // Cancelling the explicit fetch also settles our wait even if an adapter ignores AbortSignal.
    // Each request owns its timeout; an old finally block cannot clear a newer request's timer.
    let timeout: number | undefined

    try {
      await Promise.race([
        new Promise<never>((_, reject) => {
          this.#cancelScore = () => {
            if (timeout !== undefined) window.clearTimeout(timeout)
            timeout = undefined
            reject(new Error('Match score read cancelled'))
          }

          timeout = window.setTimeout(() => {
            controller.abort()
            reject(new Error('Match score read timed out'))
          }, SCORE_TIMEOUT_MS)
        }),
        this.#options.readScores(controller.signal),
      ])
    } catch {
      // Preserve monotonic UI state and retry on the next score deadline.
    }

    if (timeout !== undefined) window.clearTimeout(timeout)

    if (this.#scoreAbort !== controller) return
    this.#scoreAbort = undefined
    this.#cancelScore = undefined

    if (this.#disposed || generation !== this.#generation) return
    this.#scoreDueAt = Date.now() + SCORE_INTERVAL_MS
    this.#schedule()
  }

  #stopWork() {
    this.#clearTimer()
    this.#abortScores()
  }

  #abortScores() {
    this.#scoreAbort?.abort()
    this.#scoreAbort = undefined
    this.#cancelScore?.()
    this.#cancelScore = undefined
  }

  #clearTimer() {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #isForeground() {
    return !this.#disposed && !this.#pageHidden && document.visibilityState === 'visible'
  }
}
