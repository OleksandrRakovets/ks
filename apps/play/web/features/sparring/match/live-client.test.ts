import { afterEach, beforeEach, expect, test } from 'bun:test'

import {
  type MatchId,
  newMatchId,
  SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE,
  type SparringMatchLiveServerMessage,
} from '@ks/core'

import { subscribeSparringMatchLive } from './live-client'

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = []
  readonly url: string
  closeCalls = 0

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    FakeWebSocket.instances.push(this)
  }

  close(): void {
    this.closeCalls += 1
  }

  message(data: SparringMatchLiveServerMessage): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }))
  }

  closed(code = 1006): void {
    const event = new Event('close')
    Object.defineProperty(event, 'code', { value: code })
    this.dispatchEvent(event)
  }
}

const originalWindow = globalThis.window

const OriginalWebSocket = globalThis.WebSocket

const originalSetTimeout = globalThis.setTimeout

const originalClearTimeout = globalThis.clearTimeout

let timers = new Map<number, () => void>()

let nextTimerId = 1

beforeEach(() => {
  FakeWebSocket.instances = []
  timers = new Map()
  nextTimerId = 1
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { protocol: 'https:', host: 'play.example' } },
  })
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FakeWebSocket })
  Object.defineProperty(globalThis, 'setTimeout', {
    configurable: true,
    value: (callback: () => void) => {
      const id = nextTimerId++
      timers.set(id, callback)

      return id
    },
  })
  Object.defineProperty(globalThis, 'clearTimeout', {
    configurable: true,
    value: (id: number) => {
      timers.delete(id)
    },
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: OriginalWebSocket })
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
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

function caughtUp(socket: FakeWebSocket, matchId: MatchId, latestSeq = 2): void {
  socket.message({ contractVersion: 1, type: 'caught-up', matchId, latestSeq })
}

function update(socket: FakeWebSocket, acceptedSeq: number, endsMatch: boolean): void {
  socket.message({
    contractVersion: 1,
    type: 'update',
    update: { type: 'command-accepted', acceptedSeq, endsMatch },
  })
}

function runOldestTimer(): void {
  const entry = timers.entries().next().value

  if (!entry) throw new Error('Expected timer')
  timers.delete(entry[0])
  entry[1]()
}

test('connected waits for a valid caught-up handshake and sequences updates without replay', () => {
  const matchId = newMatchId()
  const states: string[] = []
  const caughtUpSeqs: number[] = []
  const updates: number[] = []
  const subscription = subscribe(matchId, states, caughtUpSeqs, updates)
  const socket = FakeWebSocket.instances[0]

  expect(socket.url).toBe(`wss://play.example/api/sparring-match/${matchId}/live/?contract=1&view=control`)
  socket.dispatchEvent(new Event('open'))
  expect(states).toEqual(['connecting'])
  caughtUp(socket, matchId, 3)
  update(socket, 4, false)
  update(socket, 4, false)

  expect(states).toEqual(['connecting', 'connected'])
  expect(caughtUpSeqs).toEqual([3])
  expect(updates).toEqual([4])
  expect(timers.size).toBe(0)
  subscription.stop()
})

test('handshake timeout closes the socket, reports disconnected, and retries', () => {
  const states: string[] = []
  const subscription = subscribe(newMatchId(), states)
  const first = FakeWebSocket.instances[0]

  first.dispatchEvent(new Event('open'))
  runOldestTimer()
  expect(first.closeCalls).toBe(1)
  expect(states).toEqual(['connecting', 'disconnected'])
  runOldestTimer()
  expect(FakeWebSocket.instances).toHaveLength(2)
  expect(states).toEqual(['connecting', 'disconnected', 'connecting'])
  first.closed()
  first.dispatchEvent(new Event('error'))
  expect(timers.size).toBe(1)
  expect(states).toEqual(['connecting', 'disconnected', 'connecting'])
  subscription.stop()
})

test('terminal closure stops the subscription without requiring a score update', () => {
  const states: string[] = []
  const updates: number[] = []
  subscribe(newMatchId(), states, [], updates)
  const socket = FakeWebSocket.instances[0]

  socket.closed(SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE)
  socket.closed(SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE)

  expect(states).toEqual(['connecting', 'finished'])
  expect(updates).toEqual([])
  expect(timers.size).toBe(0)
})

test('stop clears timers, emits no disconnection, and ignores late socket callbacks', () => {
  const matchId = newMatchId()
  const states: string[] = []
  const subscription = subscribe(matchId, states)
  const socket = FakeWebSocket.instances[0]

  subscription.stop()
  expect(timers.size).toBe(0)
  socket.closed()
  socket.dispatchEvent(new Event('error'))
  caughtUp(socket, matchId)
  expect(states).toEqual(['connecting'])
  expect(socket.closeCalls).toBe(1)
  expect(FakeWebSocket.instances).toHaveLength(1)
})

test('sequential and duplicate terminal hints finish exactly once without reconnect', () => {
  for (const acceptedSeq of [3, 2]) {
    const matchId = newMatchId()
    const states: string[] = []
    const updates: number[] = []
    subscribe(matchId, states, [], updates)
    const socket = FakeWebSocket.instances.at(-1)!
    caughtUp(socket, matchId)
    update(socket, acceptedSeq, true)
    socket.closed()

    expect(states).toEqual(['connecting', 'connected', 'finished'])
    expect(updates).toEqual(acceptedSeq === 3 ? [3] : [])
    expect(timers.size).toBe(0)
  }
})

test('gapped terminal hint requests catch-up then finishes without reconnect', () => {
  const matchId = newMatchId()
  const states: string[] = []
  const caughtUpSeqs: number[] = []
  subscribe(matchId, states, caughtUpSeqs)
  const socket = FakeWebSocket.instances[0]
  caughtUp(socket, matchId)
  update(socket, 4, true)

  expect(caughtUpSeqs).toEqual([4])
  expect(states).toEqual(['connecting', 'connected', 'finished'])
  expect(socket.closeCalls).toBe(1)
  expect(timers.size).toBe(0)
})
