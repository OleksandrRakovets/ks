import { afterEach, beforeEach, expect, test } from 'bun:test'

import { newMatchId, type SparringMatchLiveServerMessage } from '@ks/core'

import { LiveTestBrowser } from '@/features/freshness/test-browser'

import { MatchLiveController } from './live-controller'

class TestSocket extends EventTarget {
  static instances: TestSocket[] = []
  readonly url: string
  closeCalls = 0
  constructor(url: string) {
    super()
    this.url = url
    TestSocket.instances.push(this)
  }
  close(): void {
    this.closeCalls++
  }
  message(message: SparringMatchLiveServerMessage): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
  }
  closed(code = 1006): void {
    const event = new Event('close')
    Object.defineProperty(event, 'code', { value: code })
    this.dispatchEvent(event)
  }
}

let browser: LiveTestBrowser

let controller: MatchLiveController

let matchId = newMatchId()

let reads: ReturnType<typeof Promise.withResolvers<void>>[]

beforeEach(() => {
  browser = new LiveTestBrowser()
  browser.replace('WebSocket', { value: TestSocket })
  TestSocket.instances = []
  matchId = newMatchId()
  reads = []
  controller = new MatchLiveController(matchId, 'control', 4, () => {
    const read = Promise.withResolvers<void>()
    reads.push(read)

    return read.promise
  })
})

afterEach(() => {
  controller.dispose()
  browser.restore()
})

function socket(): TestSocket {
  const current = TestSocket.instances.at(-1)

  if (!current) throw new Error('Expected socket')

  return current
}

function caughtUp(seq = 4): void {
  socket().message({ contractVersion: 1, type: 'caught-up', matchId, latestSeq: seq })
}

function update(seq: number, endsMatch = false): void {
  socket().message({
    contractVersion: 1,
    type: 'update',
    update: {
      type: 'command-accepted',
      acceptedSeq: seq,
      endsMatch,
    },
  })
}

test('visible WS updates coalesce and a cursor received during a read is not lost', async () => {
  controller.start()
  caughtUp()
  update(5)
  update(6)
  expect(reads).toHaveLength(1)
  controller.snapshot(5)
  reads[0].resolve()
  await browser.flush()
  expect(reads).toHaveLength(2)
  controller.snapshot(6)
  reads[1].resolve()
  await browser.flush()
  update(6)
  expect(reads).toHaveLength(2)
})

test('local submission suppresses echoes but retains a later remote sequence', async () => {
  controller.start()
  caughtUp()
  controller.setSubmitting(true)
  update(5)
  update(6)
  expect(reads).toHaveLength(0)
  controller.snapshot(5)
  controller.setSubmitting(false)
  expect(reads).toHaveLength(1)
  controller.snapshot(6)
  reads[0].resolve()
  await browser.flush()
  expect(reads).toHaveLength(1)
})

test('a browser return during local submission waits for it instead of reading over the POST', async () => {
  controller.start()
  caughtUp()
  controller.setSubmitting(true)
  browser.visibility('hidden')
  browser.visibility('visible')
  browser.window.dispatchEvent(new Event('focus'))
  await browser.advance(60_000)
  expect(reads).toHaveLength(0)
  controller.snapshot(5)
  controller.setSubmitting(false)
  expect(reads).toHaveLength(1)
})

test('terminal signal with an equal cursor forces a read after submission and stops reconnecting', async () => {
  controller.start()
  caughtUp()
  controller.setSubmitting(true)
  update(4, true)
  expect(reads).toHaveLength(0)
  controller.snapshot(4)
  controller.setSubmitting(false)
  expect(reads).toHaveLength(1)
  expect(socket().closeCalls).toBe(1)
  browser.visibility('hidden')
  browser.visibility('visible')
  expect(TestSocket.instances).toHaveLength(1)
  expect(reads).toHaveLength(2)
  controller.dispose()

  for (const read of reads) read.resolve()
  await browser.advance(5 * 60_000)
  expect(reads).toHaveLength(2)
})

test('terminal hint arriving during a read remains forced even if that read reaches its cursor', async () => {
  controller.start()
  caughtUp()
  update(5)
  update(6, true)
  controller.snapshot(6)
  reads[0].resolve()
  await browser.flush()
  expect(reads).toHaveLength(2)
  expect(TestSocket.instances).toHaveLength(1)
})

test('one gapped terminal message starts one forced read, not competing cursor and terminal reads', async () => {
  controller.start()
  caughtUp()
  update(6, true)
  expect(reads).toHaveLength(1)
  controller.snapshot(6)
  reads[0].resolve()
  await browser.flush()
  expect(reads).toHaveLength(1)
  expect(socket().closeCalls).toBe(1)
})

test('failed cursor read waits for the watchdog instead of retrying an unsatisfied target in a loop', async () => {
  controller.start()
  caughtUp()
  update(5)
  reads[0].reject(new Error('Unavailable'))
  await browser.flush()
  await browser.advance(59_999)
  expect(reads).toHaveLength(1)
  await browser.advance(1)
  expect(reads).toHaveLength(2)
  controller.snapshot(5)
  reads[1].resolve()
  await browser.flush()
  expect(reads).toHaveLength(2)
})

test('pagehide releases socket and a return replaces a pending read; return hints coalesce', async () => {
  controller.start()
  caughtUp()
  update(5)
  const previous = socket()
  browser.window.dispatchEvent(new Event('pagehide'))
  await browser.advance(24 * 60 * 60_000)
  expect(previous.closeCalls).toBe(1)
  expect(reads).toHaveLength(1)
  browser.pageShow()
  browser.window.dispatchEvent(new Event('focus'))
  browser.window.dispatchEvent(new Event('online'))
  expect(reads).toHaveLength(2)
  expect(TestSocket.instances).toHaveLength(2)
  previous.closed()
  caughtUp(5)
  controller.snapshot(5)
  reads[0].resolve()
  reads[1].resolve()
  await browser.flush()
  expect(reads).toHaveLength(2)
  await browser.advance(60_000)
  expect(reads).toHaveLength(3)
})

test('persisted pageshow catches up even if no hide event ran, while initial pageshow does not', () => {
  controller.start()
  caughtUp()
  browser.pageShow(false)
  expect(reads).toHaveLength(0)
  browser.pageShow()
  expect(reads).toHaveLength(1)
  expect(TestSocket.instances).toHaveLength(2)
})

test('focus on a visible page reads without replacing a healthy socket; online replaces it', async () => {
  controller.start()
  caughtUp()
  browser.window.dispatchEvent(new Event('focus'))
  expect(reads).toHaveLength(1)
  expect(TestSocket.instances).toHaveLength(1)
  expect(socket().closeCalls).toBe(0)
  controller.snapshot(4)
  reads[0].resolve()
  await browser.flush()
  browser.window.dispatchEvent(new Event('online'))
  expect(reads).toHaveLength(2)
  expect(TestSocket.instances).toHaveLength(2)
})

test('silent connected socket has an HTTP watchdog, and retries do not flood HTTP', async () => {
  controller.start()
  caughtUp()
  await browser.advance(59_999)
  expect(reads).toHaveLength(0)
  await browser.advance(1)
  expect(reads).toHaveLength(1)
  reads[0].resolve()
  await browser.flush()
  socket().closed()
  expect(reads).toHaveLength(2)
  reads[1].resolve()
  await browser.flush()
  await browser.advance(30_000)
  expect(TestSocket.instances.length).toBeGreaterThan(1)
  expect(reads).toHaveLength(2)
})

test('initially hidden page connects only on return, then disposed work stays stopped', async () => {
  browser.document.visibilityState = 'hidden'
  controller.start()
  await browser.advance(60_000)
  expect(TestSocket.instances).toHaveLength(0)
  browser.visibility('visible')
  expect(TestSocket.instances).toHaveLength(1)
  expect(reads).toHaveLength(1)
  controller.dispose()
  browser.pageShow()
  browser.window.dispatchEvent(new Event('focus'))
  reads[0].resolve()
  await browser.advance(60_000)
  expect(reads).toHaveLength(1)
  expect(TestSocket.instances).toHaveLength(1)
})
