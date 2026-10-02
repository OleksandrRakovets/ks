import { expect, test } from 'bun:test'

import { newMatchId } from '@ks/core'

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

  message(data: string | Blob): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

test('live client validates catch-up and sequences updates without replay', async () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { protocol: 'https:', host: 'play.example' } },
  })
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FakeWebSocket })
  FakeWebSocket.instances = []
  const matchId = newMatchId()
  const caughtUp: number[] = []
  const updates: number[] = []
  const states: string[] = []

  const subscription = subscribeSparringMatchLive({
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

  await Promise.resolve()
  const socket = FakeWebSocket.instances.at(0)

  if (socket === undefined) throw new Error('Expected live socket')
  expect(socket.url).toBe(`wss://play.example/api/sparring-match/${matchId}/live/?contract=1&view=control`)
  socket.dispatchEvent(new Event('open'))
  socket.message(JSON.stringify({ contractVersion: 1, type: 'caught-up', matchId, latestSeq: 3 }))
  socket.message(
    JSON.stringify({
      contractVersion: 1,
      type: 'update',
      update: { type: 'command-accepted', acceptedSeq: 4, endsMatch: false },
    }),
  )
  socket.message(
    JSON.stringify({
      contractVersion: 1,
      type: 'update',
      update: { type: 'command-accepted', acceptedSeq: 4, endsMatch: false },
    }),
  )
  expect(caughtUp).toEqual([3])
  expect(updates).toEqual([4])
  expect(states).toEqual(['connecting', 'connected'])
  subscription.stop()
  expect(socket.closeCalls).toBe(1)
})

test('live client stops and requests catch-up for a gapped match-ending update', () => {
  FakeWebSocket.instances = []
  const matchId = newMatchId()
  const caughtUp: number[] = []
  const states: string[] = []

  const subscription = subscribeSparringMatchLive({
    matchId,
    pageKind: 'control',
    currentLatestSeq: () => 2,
    onCaughtUp: (seq) => {
      caughtUp.push(seq)
    },
    onUpdate: () => {},
    onConnectionState: (state) => {
      states.push(state)
    },
  })

  const socket = FakeWebSocket.instances.at(0)

  if (socket === undefined) throw new Error('Expected live socket')
  socket.message(
    JSON.stringify({
      contractVersion: 1,
      type: 'caught-up',
      matchId,
      latestSeq: 2,
    }),
  )
  socket.message(
    JSON.stringify({
      contractVersion: 1,
      type: 'update',
      update: { type: 'command-accepted', acceptedSeq: 4, endsMatch: true },
    }),
  )
  expect(caughtUp).toEqual([4])
  expect(states).toEqual(['connecting', 'finished'])
  expect(socket.closeCalls).toBe(1)
  subscription.stop()
})

test.each([
  '{',
  'null',
  new Blob(['{}']),
  JSON.stringify({ contractVersion: 2, type: 'caught-up', latestSeq: 0 }),
])('live client stops on malformed or unsupported input %s', (payload) => {
  FakeWebSocket.instances = []
  const states: string[] = []

  const subscription = subscribeSparringMatchLive({
    matchId: newMatchId(),
    pageKind: 'protocol',
    currentLatestSeq: () => 0,
    onCaughtUp: () => {
      throw new Error('Invalid input requested catch-up')
    },
    onUpdate: () => {
      throw new Error('Invalid input emitted an update')
    },
    onConnectionState: (state) => {
      states.push(state)
    },
  })

  const socket = FakeWebSocket.instances.at(0)

  if (socket === undefined) throw new Error('Expected live socket')

  socket.message(payload)
  expect(states).toEqual(['connecting', 'invalid-message'])
  expect(socket.closeCalls).toBe(1)
  subscription.stop()
  expect(socket.closeCalls).toBe(1)
})

test('live client strips forward-compatible message fields', () => {
  FakeWebSocket.instances = []
  const matchId = newMatchId()
  const caughtUp: number[] = []

  const subscription = subscribeSparringMatchLive({
    matchId,
    pageKind: 'protocol',
    currentLatestSeq: () => 0,
    onCaughtUp: (seq) => {
      caughtUp.push(seq)
    },
    onUpdate: () => {},
    onConnectionState: () => {},
  })

  const socket = FakeWebSocket.instances.at(0)

  if (socket === undefined) throw new Error('Expected live socket')

  socket.message(JSON.stringify({ contractVersion: 1, type: 'caught-up', matchId, latestSeq: 6, extra: true }))
  expect(caughtUp).toEqual([6])
  expect(socket.closeCalls).toBe(0)
  subscription.stop()
})
