import { watchBrowserReturn } from './browser-return'

const RETRY_INTERVAL_MS = 60_000

/**
 * Schedules failed loader GET retries while an error boundary has replaced the page.
 *
 * It never retries immediately on mount, so a persistent failure costs one GET per minute while
 * visible, plus one per browser return. Overlapping return hints share one read. A read started
 * before hiding may still settle, but only the replacement read rearms the retry deadline.
 */
export class ReadRecovery {
  readonly #read: () => Promise<void>
  #timer?: number
  #generation = 0
  #reading = false
  #disposed = false
  #stopWatchingBrowser?: () => void

  constructor(read: () => Promise<void>) {
    this.#read = read
  }

  start(): void {
    this.#stopWatchingBrowser = watchBrowserReturn({
      onHide: () => {
        this.#generation++
        this.#reading = false
        this.#clearTimer()
      },
      onReturn: () => {
        if (!this.#reading) this.#retry()
      },
    })
    this.#schedule()
  }

  dispose(): void {
    this.#disposed = true
    this.#generation++
    this.#clearTimer()
    this.#stopWatchingBrowser?.()
  }

  #retry() {
    if (this.#disposed || document.visibilityState !== 'visible') return
    this.#clearTimer()
    this.#reading = true
    const generation = ++this.#generation

    const finished = () => {
      if (this.#disposed || generation !== this.#generation) return
      this.#reading = false
      this.#schedule()
    }

    void this.#read().then(finished, finished)
  }

  #schedule() {
    this.#clearTimer()

    if (!this.#disposed && document.visibilityState === 'visible')
      this.#timer = window.setTimeout(() => this.#retry(), RETRY_INTERVAL_MS)
  }

  #clearTimer() {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = undefined
  }
}
