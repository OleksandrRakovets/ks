import { afterEach, beforeEach, expect, test } from 'bun:test'

import { ReadRecovery } from '@/features/freshness/read-recovery'
import { LiveTestBrowser } from '@/features/freshness/test-browser'

let browser: LiveTestBrowser

let recovery: ReadRecovery

let reads: ReturnType<typeof Promise.withResolvers<void>>[]

beforeEach(() => {
  browser = new LiveTestBrowser()
  reads = []
  recovery = new ReadRecovery(() => {
    const read = Promise.withResolvers<void>()
    reads.push(read)

    return read.promise
  })
})

afterEach(() => {
  recovery.dispose()
  browser.restore()
})

test('a failed page retries once per minute, and overlapping return hints share the pending read', async () => {
  recovery.start()
  expect(reads).toHaveLength(0)
  await browser.advance(60_000)
  expect(reads).toHaveLength(1)
  browser.window.dispatchEvent(new Event('focus'))
  browser.window.dispatchEvent(new Event('online'))
  expect(reads).toHaveLength(1)
  reads[0].resolve()
  await browser.flush()
  await browser.advance(59_999)
  expect(reads).toHaveLength(1)
  await browser.advance(1)
  expect(reads).toHaveLength(2)
})

test('a hidden page stops retrying; return retries at once and a pre-hide read cannot rearm the deadline', async () => {
  recovery.start()
  await browser.advance(60_000)
  browser.visibility('hidden')
  await browser.advance(24 * 60 * 60_000)
  expect(reads).toHaveLength(1)
  browser.visibility('visible')
  browser.pageShow()
  expect(reads).toHaveLength(2)
  reads[0].resolve()
  await browser.flush()
  await browser.advance(60_000)
  expect(reads).toHaveLength(2)
  reads[1].resolve()
  await browser.flush()
  await browser.advance(60_000)
  expect(reads).toHaveLength(3)
})
