import { spyOn } from 'bun:test'

/** Small deterministic browser clock for the feature's lifecycle tests, not a DOM renderer. */
export class LiveTestBrowser {
  now = 1_000_000
  readonly document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  readonly window = Object.assign(new EventTarget(), {
    location: { protocol: 'https:', host: 'play.example' },
    setTimeout: (callback: () => void, delay = 0) => this.#setTimeout(callback, delay),
    clearTimeout: (id: number) => this.#timers.delete(id),
  })
  #nextId = 1
  readonly #timers = new Map<number, { at: number; callback: () => void }>()
  readonly #restores: (() => void)[] = []

  constructor() {
    const clock = spyOn(Date, 'now').mockImplementation(() => this.now)
    this.#restores.push(() => clock.mockRestore())
    this.replace('document', { value: this.document })
    this.replace('window', { value: this.window })
    this.replace('setTimeout', { value: this.window.setTimeout })
    this.replace('clearTimeout', { value: this.window.clearTimeout })
  }

  replace(name: string, replacement: PropertyDescriptor): void {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, ...replacement })
    this.#restores.push(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    })
  }

  restore(): void {
    for (const restore of [...this.#restores].reverse()) restore()
  }

  visibility(state: 'visible' | 'hidden'): void {
    this.document.visibilityState = state
    this.document.dispatchEvent(new Event('visibilitychange'))
  }

  pageShow(persisted = true): void {
    const event = new Event('pageshow')
    Object.defineProperty(event, 'persisted', { value: persisted })
    this.window.dispatchEvent(event)
  }

  async advance(milliseconds: number): Promise<void> {
    const end = this.now + milliseconds

    for (;;) {
      const due = [...this.#timers]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)
        .at(0)

      if (due === undefined) break
      this.now = due[1].at
      this.#timers.delete(due[0])
      due[1].callback()
      await this.flush()
    }

    this.now = end
    await this.flush()
  }

  async flush(): Promise<void> {
    // Promise.race, controller finally, and Router-like completion callbacks occupy successive
    // microtasks. Drain them without advancing wall time or silently running future timers.
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }

  #setTimeout(callback: () => void, delay: number) {
    const id = this.#nextId++
    this.#timers.set(id, { at: this.now + delay, callback })

    return id
  }
}
