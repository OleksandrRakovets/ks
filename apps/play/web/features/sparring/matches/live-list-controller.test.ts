import { afterEach, beforeEach, expect, test } from 'bun:test'

import { LiveTestBrowser } from '../live-test-browser'
import { LiveListController } from './live-list-controller'

let browser: LiveTestBrowser

let controller: LiveListController

beforeEach(() => {
  browser = new LiveTestBrowser()
})

afterEach(() => {
  controller.dispose()
  browser.restore()
})

test('thirty-minute visible list alternates scores and full reads, with full priority at equality', async () => {
  const reads: string[] = []
  controller = new LiveListController({
    hasScores: () => true,
    readScores: async () => {
      reads.push('scores')
    },
    readFullList: async () => {
      reads.push('full')
    },
  })
  controller.start()
  await browser.advance(30 * 60_000)
  expect(reads).toEqual(Array.from({ length: 30 }, () => ['scores', 'full']).flat())
})

test('empty list still discovers membership, and foreground hints coalesce', async () => {
  let reads = 0
  let resolveRead = () => {}

  controller = new LiveListController({
    hasScores: () => false,
    readScores: async () => {
      throw new Error('No score read expected')
    },
    readFullList: () => {
      reads++

      return new Promise<void>((resolve) => {
        resolveRead = resolve
      })
    },
  })
  controller.start()
  await browser.advance(59_999)
  expect(reads).toBe(0)
  await browser.advance(1)
  expect(reads).toBe(1)
  browser.visibility('hidden')
  browser.now += 24 * 60 * 60_000
  browser.visibility('visible')
  browser.pageShow()
  browser.window.dispatchEvent(new Event('focus'))
  browser.window.dispatchEvent(new Event('online'))
  expect(reads).toBe(2)
  resolveRead()
  await browser.flush()
  await browser.advance(59_999)
  expect(reads).toBe(2)
  await browser.advance(1)
  expect(reads).toBe(3)
})

test('expiry preempts a slow score read and uses a newly returned absolute deadline', async () => {
  let reads = 0
  let signal: AbortSignal | undefined
  const expiry = browser.now + 35_000
  controller = new LiveListController({
    hasScores: () => true,
    recentFinishedMatchExpiresAt: expiry,
    readScores: (incoming) => {
      signal = incoming

      return new Promise<void>(() => {})
    },
    readFullList: async () => {
      reads++
      controller.snapshot(reads === 1 ? expiry + 5_000 : undefined)
    },
  })
  controller.start()
  await browser.advance(35_099)
  expect(reads).toBe(0)
  expect(signal?.aborted).toBe(false)
  await browser.advance(1)
  expect(reads).toBe(1)
  expect(signal?.aborted).toBe(true)
  await browser.advance(5_000)
  expect(reads).toBe(2)
})

test('pagehide stops scores; overnight pageshow reads immediately and late work cannot restart polling', async () => {
  let fullReads = 0
  let scoreReads = 0
  let resolveScores = () => {}

  let signal: AbortSignal | undefined
  controller = new LiveListController({
    hasScores: () => true,
    recentFinishedMatchExpiresAt: browser.now + 10 * 60_000,
    readScores: (incoming) => {
      scoreReads++
      signal = incoming

      return new Promise<void>((resolve) => {
        resolveScores = resolve
      })
    },
    readFullList: async () => {
      fullReads++
      controller.snapshot(undefined)
    },
  })
  controller.start()
  await browser.advance(30_000)
  browser.window.dispatchEvent(new Event('pagehide'))
  expect(signal?.aborted).toBe(true)
  await browser.advance(24 * 60 * 60_000)
  expect(fullReads).toBe(0)
  expect(scoreReads).toBe(1)
  browser.pageShow()
  expect(fullReads).toBe(1)
  resolveScores()
  await browser.flush()
  await browser.advance(29_999)
  expect(scoreReads).toBe(1)
  await browser.advance(1)
  expect(scoreReads).toBe(2)
})

test('score timeout does not defer the independent membership deadline', async () => {
  const reads: string[] = []
  let signal: AbortSignal | undefined
  controller = new LiveListController({
    hasScores: () => true,
    readScores: (incoming) => {
      signal = incoming
      reads.push('scores')

      return new Promise<void>(() => {})
    },
    readFullList: async () => {
      reads.push('full')
    },
  })
  controller.start()
  await browser.advance(39_999)
  expect(signal?.aborted).toBe(false)
  await browser.advance(1)
  expect(signal?.aborted).toBe(true)
  await browser.advance(20_000)
  expect(reads).toEqual(['scores', 'full'])
})

test('a discovered Active Match starts scores at the next score deadline even if React commits after the GET', async () => {
  const reads: string[] = []
  let hasScores = false
  controller = new LiveListController({
    hasScores: () => hasScores,
    readScores: async () => {
      reads.push('scores')
    },
    readFullList: async () => {
      reads.push('full')
    },
  })
  controller.start()
  await browser.advance(60_000)
  expect(reads).toEqual(['full'])
  hasScores = true
  controller.snapshot(undefined)
  await browser.advance(29_999)
  expect(reads).toEqual(['full'])
  await browser.advance(1)
  expect(reads).toEqual(['full', 'scores'])
  await browser.advance(30_000)
  expect(reads).toEqual(['full', 'scores', 'full'])
})

test('a new full-read requirement during a read is retained, and failed expiry does not spin', async () => {
  let reads = 0
  let rejectRead = (_error: Error) => {}

  controller = new LiveListController({
    hasScores: () => false,
    recentFinishedMatchExpiresAt: browser.now,
    readScores: async () => {},
    readFullList: () => {
      reads++

      return new Promise<void>((_resolve, reject) => {
        rejectRead = reject
      })
    },
  })
  controller.start()
  await browser.advance(100)
  expect(reads).toBe(1)
  controller.demandFullRead()
  rejectRead(new Error('Unavailable'))
  await browser.flush()
  expect(reads).toBe(2)
  rejectRead(new Error('Still unavailable'))
  await browser.flush()
  await browser.advance(59_999)
  expect(reads).toBe(2)
  await browser.advance(1)
  expect(reads).toBe(3)
})
