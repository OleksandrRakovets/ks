import { spyOn } from 'bun:test'

/** WebSocket stand-in whose server frames and close events are delivered by the test. */
export class TestSocket extends EventTarget {
  readonly url: string
  closeCalls = 0

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  close(): void {
    this.closeCalls++
  }

  /** Delivers one server text frame. */
  message(frame: string): void {
    this.dispatchEvent(new MessageEvent('message', { data: frame }))
  }

  /** Delivers the browser close event; 1006 is an abnormal closure without a close frame. */
  closed(code = 1006): void {
    const event = new Event('close')
    Object.defineProperty(event, 'code', { value: code })
    this.dispatchEvent(event)
  }
}

/** Small deterministic browser clock for live freshness tests, not a DOM renderer. */
export class LiveTestBrowser {
  now = 1_000_000
  /** Every socket the code under test opened, oldest first. */
  readonly sockets: TestSocket[] = []
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
    const sockets = this.sockets
    this.replace('WebSocket', {
      value: class extends TestSocket {
        constructor(url: string | URL) {
          super(url)
          sockets.push(this)
        }
      },
    })
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
    // Drain every queued microtask without advancing wall time or running fake timers. The real
    // macrotask queue is untouched by this fixture, so setImmediate runs after promise chains settle.
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  }

  #setTimeout(callback: () => void, delay: number) {
    const id = this.#nextId++
    this.#timers.set(id, { at: this.now + delay, callback })

    return id
  }
}
