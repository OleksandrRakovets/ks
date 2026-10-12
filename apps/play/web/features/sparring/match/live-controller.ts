import type { MatchId } from '@ks/core'

import { watchBrowserReturn } from '@/features/freshness/browser-return'

import { type SparringMatchLiveSubscription, subscribeSparringMatchLive } from './live-client'

/**
 * Coordinates loader freshness for one active Control or Protocol page.
 *
 * WebSockets carry invalidations, not page data. A maximum requested cursor handles ordinary
 * updates; a separate forced-read flag handles browser return and terminal hints even when the
 * cursor is unchanged. Only the loader can confirm the Result-page transition. The React owner
 * disposes this controller when that happens; an end hint merely stops socket reconnection.
 */
export class MatchLiveController {
  readonly #matchId: MatchId
  readonly #pageKind: 'control' | 'protocol'
  readonly #read: () => Promise<void>
  #latestSeq: number
  #targetSeq: number
  #forced = false
  #submitting = false
  #hidden = false
  #disposed = false
  #endHinted = false
  #disconnectReadRequested = false
  #subscription?: SparringMatchLiveSubscription
  #stopWatchingBrowser?: () => void
  #timer?: number
  #readGeneration = 0
  #reading = false
  #catchingUp = false
  #dueAt = Date.now() + 60_000

  /**
   * Creates the active-page coordinator without starting browser work.
   * The read callback must settle only after committing its projection and calling snapshot;
   * Router's network completion alone can precede React's commit and still expose an old cursor.
   */
  constructor(
    matchId: MatchId,
    pageKind: 'control' | 'protocol',
    latestSeq: number,
    read: () => Promise<void>,
  ) {
    this.#matchId = matchId
    this.#pageKind = pageKind
    this.#latestSeq = latestSeq
    this.#targetSeq = latestSeq
    this.#read = read
  }

  /** Starts visible-only socket work and the independent 60-second HTTP freshness check. */
  start(): void {
    this.#stopWatchingBrowser = watchBrowserReturn({
      onHide: () => this.#hide(),
      onReturn: () => this.#catchUp(),
    })
    this.#connect()
    this.#schedule()
  }

  /**
   * Records an authoritative loader cursor, including the automatic post-Command loader read.
   * It can satisfy queued WS updates without another GET, but cannot clear a browser/terminal
   * forced read merely because the cursor is equal. Requests arriving during a read stay pending.
   */
  snapshot(latestSeq: number): void {
    this.#latestSeq = latestSeq
    this.#drain()
  }

  /**
   * Gates background GETs across a local Command and its automatic loader refresh.
   * Call with true synchronously before fetcher.submit: a WS echo can arrive before React renders
   * the submitting state. Never retry or abort a POST as a side effect of freshness recovery.
   */
  setSubmitting(submitting: boolean): void {
    this.#submitting = submitting
    this.#drain()
  }

  /** Requests a lifecycle/freshness read which is not conditional on a newer Accepted Command. */
  forceRead(): void {
    if (this.#disposed) return
    this.#forced = true
    this.#drain()
  }

  /** Permanently releases listeners, timers, and sockets; late read completions do no work. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#readGeneration++
    this.#stopWork()
    this.#stopWatchingBrowser?.()
  }

  #hide() {
    this.#hidden = true
    this.#forced = true
    this.#catchingUp = false
    this.#reading = false
    this.#readGeneration++
    // Do not await the socket closing handshake or start a final fetch here; the return path is
    // correct even when this cleanup never ran.
    this.#stopWork()
  }

  #catchUp() {
    if (this.#disposed) return
    this.#hidden = false

    if (this.#catchingUp) return
    this.#catchingUp = true
    // Focus/pageshow/visibility can describe the same return. Only its first hint supersedes a
    // pre-return GET. Router revalidate restarts loader requests even if its state is "loading";
    // its returned promise is shared, so generations also exclude the old completion callback.
    this.#readGeneration++
    this.#reading = false
    this.#stopWork()
    this.forceRead()
    this.#connect()
  }

  #connect() {
    if (!this.#visible() || this.#endHinted || this.#subscription !== undefined) return
    this.#disconnectReadRequested = false
    this.#subscription = subscribeSparringMatchLive({
      matchId: this.#matchId,
      pageKind: this.#pageKind,
      currentLatestSeq: () => this.#latestSeq,
      onCaughtUp: (seq) => this.#requestSeq(seq),
      onUpdate: (update) => {
        this.#targetSeq = Math.max(this.#targetSeq, update.acceptedSeq)

        if (!update.endsMatch) this.#drain()
        // The transport emits finished separately. It forces a read even when this cursor is
        // already displayed, so terminal handling never relies on an inequality alone.
      },
      onConnectionState: (state) => {
        if (state === 'finished') {
          this.#endHinted = true
          this.forceRead()
        } else if (state === 'connected') {
          this.#disconnectReadRequested = false
        } else if (
          (state === 'disconnected' || state === 'invalid-message') &&
          !this.#disconnectReadRequested
        ) {
          // One immediate GET per outage, rather than a GET for every backoff attempt. The
          // independent watchdog still checks HTTP while WS retries or remains silent.
          this.#disconnectReadRequested = true
          this.forceRead()
        }
      },
    })
  }

  #requestSeq(seq: number) {
    this.#targetSeq = Math.max(this.#targetSeq, seq)
    this.#drain()
  }

  #drain() {
    if (!this.#visible() || this.#submitting || this.#reading) return

    if (!this.#forced && this.#latestSeq >= this.#targetSeq) {
      this.#schedule()

      return
    }

    this.#forced = false
    this.#reading = true
    this.#clearTimer()
    const generation = ++this.#readGeneration
    void this.#read().then(
      () => this.#readFinished(generation, true),
      () => this.#readFinished(generation, false),
    )
  }

  #readFinished(generation: number, succeeded: boolean) {
    if (this.#disposed || generation !== this.#readGeneration) return
    this.#reading = false
    this.#catchingUp = false
    this.#dueAt = Date.now() + 60_000

    if (succeeded) this.#drain()
    else {
      // Router loader errors use its error boundary, not this controller's last-data UI. If this
      // owner remains mounted, retry at the watchdog deadline instead of spinning on a target
      // cursor which the failed read could not reach.
      this.#forced = true
      this.#schedule()
    }
  }

  #schedule() {
    this.#clearTimer()

    if (!this.#visible() || this.#reading) return
    // An idle game legitimately sends no messages. This independent GET deadline recovers a
    // silent dead socket without inventing an inactivity-based WS heartbeat or wire protocol.
    this.#timer = window.setTimeout(() => this.forceRead(), Math.max(0, this.#dueAt - Date.now()))
  }

  #stopWork() {
    this.#clearTimer()
    this.#subscription?.stop()
    this.#subscription = undefined
  }

  #clearTimer() {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #visible() {
    return !this.#disposed && !this.#hidden && document.visibilityState === 'visible'
  }
}
