export type LiveListSchedulerOptions = {
  readonly readScores: (signal: AbortSignal) => Promise<void>
  readonly readFullList: () => Promise<void>
  readonly hasScores: () => boolean
  readonly recentFinishedMatchExpiresAt?: number
}

const SCORE_INTERVAL_MS = 30_000

const MEMBERSHIP_INTERVAL_MS = 60_000

const SCORE_TIMEOUT_MS = 10_000

/**
 * Coordinates the two live-list reads and browser lifecycle signals.
 *
 * The controller deliberately owns one timer: a full loader read dominates a
 * score read whenever both deadlines are due because the loader supplies both
 * membership and authoritative scores. Deadlines are absolute wall-clock
 * instants, so a throttled or suspended tab catches up rather than accumulating
 * interval drift.
 */
export class LiveListController {
  readonly #options: LiveListSchedulerOptions
  #timer?: number
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
  #expiryAt?: number

  constructor(options: LiveListSchedulerOptions) {
    this.#options = options
    const now = Date.now()
    this.#scoreDueAt = now + SCORE_INTERVAL_MS
    this.#membershipDueAt = now + MEMBERSHIP_INTERVAL_MS
    this.#expiryAt =
      options.recentFinishedMatchExpiresAt === undefined
        ? undefined
        : options.recentFinishedMatchExpiresAt + 100
  }

  /** Starts deadlines and installs all document/window lifecycle listeners. */
  start(): void {
    document.addEventListener('visibilitychange', this.#visibilityChange)
    window.addEventListener('pageshow', this.#pageShow)
    window.addEventListener('pagehide', this.#pageHide)
    window.addEventListener('focus', this.#foregroundHint)
    window.addEventListener('online', this.#foregroundHint)
    this.#schedule()
  }

  /**
   * Records a committed list projection: rereads score availability and replaces the server's
   * absolute recent-result deadline without restarting periodic deadlines. Call when either
   * pollable rows or expiry changes. An already elapsed instant requests a full read.
   */
  snapshot(expiresAt: number | undefined): void {
    // D1's cutoff is inclusive at the exact endpoint. A small margin avoids refetching the row
    // at equality; unlike a relative countdown, the absolute deadline cannot restart tomorrow.
    this.#expiryAt = expiresAt === undefined ? undefined : expiresAt + 100
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

  /**
   * Synchronously stops timers, aborts explicit score I/O, and removes listeners.
   * Browser hide cleanup has no guaranteed numeric time budget, so this method
   * starts no asynchronous cleanup and never promises completion. In particular,
   * mobile Safari/iOS may kill a page without firing any lifecycle event.
   */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#generation++
    this.#stopWork()
    document.removeEventListener('visibilitychange', this.#visibilityChange)
    window.removeEventListener('pageshow', this.#pageShow)
    window.removeEventListener('pagehide', this.#pageHide)
    window.removeEventListener('focus', this.#foregroundHint)
    window.removeEventListener('online', this.#foregroundHint)
  }

  readonly #visibilityChange = () => {
    if (document.visibilityState === 'hidden') this.#hide()
    else this.#resume()
  }

  readonly #pageHide = () => this.#hide()
  readonly #pageShow = (event: PageTransitionEvent) => {
    if (event.persisted || this.#pageHidden) this.#resume()
    else this.#schedule()
  }
  readonly #foregroundHint = () => this.#resume()

  #hide() {
    this.#pageHidden = true
    this.#generation++
    this.#fullGeneration = undefined
    this.#catchingUp = false
    // No documented portable time budget exists. If this event is delivered, clear timers and
    // request aborts synchronously; awaiting a fetch or close handshake could outlive the process.
    // A mobile process kill may omit the event entirely, so return does not depend on hide firing.
    this.#stopWork()
  }

  #resume() {
    if (this.#disposed || document.visibilityState !== 'visible') return
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
    const fullDueAt = Math.min(this.#membershipDueAt, this.#expiryAt ?? Number.POSITIVE_INFINITY)

    if (this.#pendingFull || fullDueAt <= now) {
      void this.#readFull()

      return
    }

    const canPollScores = this.#options.hasScores() && this.#scoreAbort === undefined

    if (canPollScores && this.#scoreDueAt <= now) {
      void this.#readScores()

      return
    }

    // While a score GET is pending the membership/expiry wake-up remains armed. Thus an expiry
    // can preempt slow scores rather than waiting for their network completion or timeout.
    const next = Math.min(fullDueAt, canPollScores ? this.#scoreDueAt : Infinity)

    if (Number.isFinite(next)) this.#timer = window.setTimeout(() => this.#schedule(), Math.max(0, next - now))
  }

  async #readFull() {
    if (!this.#isForeground() || this.#fullGeneration !== undefined) return
    this.#abortScores()
    const generation = this.#generation
    this.#fullGeneration = generation
    this.#pendingFull = false

    if (this.#expiryAt !== undefined && this.#expiryAt <= Date.now()) this.#expiryAt = undefined
    let succeeded = false

    try {
      await this.#options.readFullList()
      succeeded = true
    } catch {
      // Router loader errors may replace the page with its error boundary. If still mounted,
      // retry on the membership cadence; never spin on an already consumed expiry deadline.
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
