import { afterEach, beforeEach, expect, test } from 'bun:test'

import { newMatchId, type SparringMatchLiveServerMessage } from '@ks/core'

import { LiveTestBrowser, type TestSocket } from '@/features/freshness/test-browser'
import { MatchLiveController } from '@/features/sparring/match/live-controller'

let browser: LiveTestBrowser

let controller: MatchLiveController

let matchId = newMatchId()

let reads: ReturnType<typeof Promise.withResolvers<void>>[]

beforeEach(() => {
  browser = new LiveTestBrowser()
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
  const current = browser.sockets.at(-1)

  if (!current) throw new Error('Expected socket')

  return current
}

function caughtUp(seq = 4): void {
  socket().message(
    JSON.stringify({
      contractVersion: 1,
      type: 'caught-up',
      matchId,
      latestSeq: seq,
    } satisfies SparringMatchLiveServerMessage),
  )
}

function update(seq: number): void {
  socket().message(
    JSON.stringify({
      contractVersion: 1,
      type: 'update',
      update: { type: 'command-accepted', acceptedSeq: seq },
    } satisfies SparringMatchLiveServerMessage),
  )
}

function liveEnded(): void {
  socket().message(
    JSON.stringify({ contractVersion: 1, type: 'live-ended' } satisfies SparringMatchLiveServerMessage),
  )
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
  liveEnded()
  expect(reads).toHaveLength(0)
  controller.snapshot(4)
  controller.setSubmitting(false)
  expect(reads).toHaveLength(1)
  expect(socket().closeCalls).toBe(1)
  browser.visibility('hidden')
  browser.visibility('visible')
  expect(browser.sockets).toHaveLength(1)
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
  update(6)
  liveEnded()
  controller.snapshot(6)
  reads[0].resolve()
  await browser.flush()
  expect(reads).toHaveLength(2)
  expect(browser.sockets).toHaveLength(1)
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
  expect(browser.sockets).toHaveLength(2)
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
  expect(browser.sockets).toHaveLength(2)
})

test('focus on a visible page reads without replacing a healthy socket; online replaces it', async () => {
  controller.start()
  caughtUp()
  browser.window.dispatchEvent(new Event('focus'))
  expect(reads).toHaveLength(1)
  expect(browser.sockets).toHaveLength(1)
  expect(socket().closeCalls).toBe(0)
  controller.snapshot(4)
  reads[0].resolve()
  await browser.flush()
  browser.window.dispatchEvent(new Event('online'))
  expect(reads).toHaveLength(2)
  expect(browser.sockets).toHaveLength(2)
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
  expect(browser.sockets.length).toBeGreaterThan(1)
  expect(reads).toHaveLength(2)
})

test('initially hidden page connects only on return, then disposed work stays stopped', async () => {
  browser.document.visibilityState = 'hidden'
  controller.start()
  await browser.advance(60_000)
  expect(browser.sockets).toHaveLength(0)
  browser.visibility('visible')
  expect(browser.sockets).toHaveLength(1)
  expect(reads).toHaveLength(1)
  controller.dispose()
  browser.pageShow()
  browser.window.dispatchEvent(new Event('focus'))
  reads[0].resolve()
  await browser.advance(60_000)
  expect(reads).toHaveLength(1)
  expect(browser.sockets).toHaveLength(1)
})
