import { afterEach, beforeEach, expect, test } from 'bun:test'

import {
  type MatchId,
  newMatchId,
  SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE,
  type SparringMatchLiveServerMessage,
} from '@ks/core'

import { LiveTestBrowser, type TestSocket } from '@/features/freshness/test-browser'

import { subscribeSparringMatchLive } from './live-client'

let browser: LiveTestBrowser

beforeEach(() => {
  browser = new LiveTestBrowser()
})

afterEach(() => {
  browser.restore()
})

function subscribe(matchId: MatchId, states: string[], caughtUp: number[] = [], updates: number[] = []) {
  return subscribeSparringMatchLive({
    matchId,
    pageKind: 'control',
    currentLatestSeq: () => 2,
    onCaughtUp: (seq) => {
      caughtUp.push(seq)
    },
    onUpdate: (update) => {
      updates.push(update.acceptedSeq)
    },
    onConnectionState: (state) => {
      states.push(state)
    },
  })
}

function caughtUp(socket: TestSocket, matchId: MatchId, latestSeq = 2): void {
  socket.message(
    JSON.stringify({
      contractVersion: 1,
      type: 'caught-up',
      matchId,
      latestSeq,
    } satisfies SparringMatchLiveServerMessage),
  )
}

function update(socket: TestSocket, acceptedSeq: number): void {
  socket.message(
    JSON.stringify({
      contractVersion: 1,
      type: 'update',
      update: { type: 'command-accepted', acceptedSeq },
    } satisfies SparringMatchLiveServerMessage),
  )
}

function liveEnded(socket: TestSocket): void {
  socket.message(
    JSON.stringify({ contractVersion: 1, type: 'live-ended' } satisfies SparringMatchLiveServerMessage),
  )
}

test('connected waits for a valid caught-up handshake and sequences updates without replay', async () => {
  const matchId = newMatchId()
  const states: string[] = []
  const caughtUpSeqs: number[] = []
  const updates: number[] = []
  const subscription = subscribe(matchId, states, caughtUpSeqs, updates)
  const socket = browser.sockets[0]

  expect(socket.url).toBe(`wss://play.example/api/sparring-match/${matchId}/live/?contract=1&view=control`)
  socket.dispatchEvent(new Event('open'))
  expect(states).toEqual(['connecting'])
  caughtUp(socket, matchId, 3)
  update(socket, 4)
  update(socket, 4)
  await browser.advance(60_000)

  expect(states).toEqual(['connecting', 'connected'])
  expect(caughtUpSeqs).toEqual([3])
  expect(updates).toEqual([4])
  expect(browser.sockets).toHaveLength(1)
  subscription.stop()
})

test('handshake timeout closes the socket, reports disconnected, and retries once', async () => {
  const matchId = newMatchId()
  const states: string[] = []
  const subscription = subscribe(matchId, states)
  const first = browser.sockets[0]

  first.dispatchEvent(new Event('open'))
  await browser.advance(9_999)
  expect(states).toEqual(['connecting'])
  await browser.advance(1)
  expect(first.closeCalls).toBe(1)
  expect(states).toEqual(['connecting', 'disconnected'])
  // The first backoff is 500 ms with at most 25% jitter.
  await browser.advance(625)
  expect(browser.sockets).toHaveLength(2)
  first.closed()
  first.dispatchEvent(new Event('error'))
  caughtUp(browser.sockets[1], matchId)
  await browser.advance(60_000)
  expect(states).toEqual(['connecting', 'disconnected', 'connecting', 'connected'])
  expect(browser.sockets).toHaveLength(2)
  subscription.stop()
})

test('terminal closure stops the subscription without requiring a score update', async () => {
  const states: string[] = []
  const updates: number[] = []
  subscribe(newMatchId(), states, [], updates)
  const socket = browser.sockets[0]

  socket.closed(SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE)
  socket.closed(SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE)
  await browser.advance(60_000)

  expect(states).toEqual(['connecting', 'finished'])
  expect(updates).toEqual([])
  expect(browser.sockets).toHaveLength(1)
})

test('stop emits no disconnection and ignores late socket callbacks and timers', async () => {
  const matchId = newMatchId()
  const states: string[] = []
  const subscription = subscribe(matchId, states)
  const socket = browser.sockets[0]

  subscription.stop()
  socket.closed()
  socket.dispatchEvent(new Event('error'))
  caughtUp(socket, matchId)
  await browser.advance(60_000)
  expect(states).toEqual(['connecting'])
  expect(socket.closeCalls).toBe(1)
  expect(browser.sockets).toHaveLength(1)
})

test('live-ended finishes exactly once before the close, with or without a final update', async () => {
  for (const finalUpdate of [true, false]) {
    const matchId = newMatchId()
    const states: string[] = []
    const updates: number[] = []
    subscribe(matchId, states, [], updates)
    const socket = browser.sockets.at(-1)!
    const opened = browser.sockets.length
    caughtUp(socket, matchId)

    if (finalUpdate) update(socket, 3)
    liveEnded(socket)
    liveEnded(socket)
    socket.closed(SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE)
    await browser.advance(60_000)

    expect(states).toEqual(['connecting', 'connected', 'finished'])
    expect(updates).toEqual(finalUpdate ? [3] : [])
    expect(browser.sockets).toHaveLength(opened)
  }
})

test('gapped update requests catch-up and replaces the socket', async () => {
  const matchId = newMatchId()
  const states: string[] = []
  const caughtUpSeqs: number[] = []
  const subscription = subscribe(matchId, states, caughtUpSeqs)
  const socket = browser.sockets[0]
  caughtUp(socket, matchId)
  update(socket, 4)
  expect(caughtUpSeqs).toEqual([4])
  expect(socket.closeCalls).toBe(1)
  socket.closed()
  await browser.advance(625)

  expect(states).toEqual(['connecting', 'connected', 'disconnected', 'connecting'])
  expect(browser.sockets).toHaveLength(2)
  subscription.stop()
})
