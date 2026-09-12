import { describe, expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { newCommandId, newMatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { RouterContextProvider } from 'react-router'

import { subscribeSparringMatchLive } from '../../live/sparring-match-live-client'
import { type AppLoadContext, cloudflareContext } from '../../server/context'
import { commandMatchAction, type ControlLiveState, transitionControlLive } from './shared'

const initial: ControlLiveState = { latestSeq: 4, suppressUntilSeq: 4, localSubmitInFlight: false }

function makeActionContext(submitMatchCommand: Application['submitMatchCommand']): AppLoadContext {
  const provider = new RouterContextProvider()
  // SAFETY: the test supplies only submitMatchCommand, which is all commandMatchAction reads from Application.
  const application = { submitMatchCommand } as Application
  provider.set(cloudflareContext, { application })

  return provider
}

describe('commandMatchAction adaptation', () => {
  test('returns acceptedSeqMax for accepted outcomes', async () => {
    const matchId = newMatchId()
    const commandId = newCommandId()

    const context = makeActionContext(async () => ({
      ok: true,
      outcome: {
        _tag: 'accepted',
        acceptedSeq: 5,
      },
    }))

    const form = new FormData()
    form.set('command', JSON.stringify({ commandId, source: 'match', command: { type: 'frame.prepare' } }))

    const result = await commandMatchAction(
      {
        params: { matchId },
        request: new Request('http://localhost', { method: 'POST', body: form }),
        context,
      },
      'free-pyramid',
    )

    expect(result).toEqual({ ok: true, acceptedSeqMax: 5 })
  })

  test('returns commandRejectedByRules for rejected outcomes', async () => {
    const matchId = newMatchId()
    const commandId = newCommandId()

    const context = makeActionContext(async () => ({
      ok: true,
      outcome: { _tag: 'rejected', reason: { code: 'frame-already-active' } },
    }))

    const form = new FormData()
    form.set('command', JSON.stringify({ commandId, source: 'match', command: { type: 'frame.prepare' } }))

    const result = await commandMatchAction(
      {
        params: { matchId },
        request: new Request('http://localhost', { method: 'POST', body: form }),
        context,
      },
      'free-pyramid',
    )

    expect(result).toEqual({ ok: false, errorKey: keys.match.control.commandRejectedByRules })
  })
})

describe('control live transitions', () => {
  test('stale updates do nothing', () => {
    expect(transitionControlLive(initial, { type: 'update', seq: 4 })).toEqual({
      state: initial,
      revalidate: false,
    })
  })

  test('accepted local sequences stay suppressed after submission completes', () => {
    const submitting = transitionControlLive(initial, { type: 'submit-started' }).state
    const accepted = transitionControlLive(submitting, { type: 'accepted', seq: 7 }).state
    const finished = transitionControlLive(accepted, { type: 'submit-finished' }).state
    const echoed = transitionControlLive(finished, { type: 'update', seq: 7 })
    expect(echoed.state.latestSeq).toBe(7)
    expect(echoed.revalidate).toBe(false)
    expect(transitionControlLive(echoed.state, { type: 'update', seq: 8 }).revalidate).toBe(true)
  })

  test('match end revalidates even when its sequence is stale', () => {
    expect(transitionControlLive(initial, { type: 'match-ended', seq: 3 })).toEqual({
      state: initial,
      revalidate: true,
    })
  })
})

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

  message(data: string): void {
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
  const socket = FakeWebSocket.instances[0]

  if (socket === undefined) throw new Error('Expected live socket')
  expect(socket.url).toBe(`wss://play.example/api/sparring-match/${matchId}/live/?contract=1&view=control`)
  socket.dispatchEvent(new Event('open'))
  socket.message(JSON.stringify({ contractVersion: 1, type: 'caught-up', matchId, latestSeq: 3 }))
  socket.message(
    JSON.stringify({
      contractVersion: 1,
      type: 'update',
      update: { type: 'command-accepted', acceptedSeq: 4, completesMatch: false },
    }),
  )
  socket.message(
    JSON.stringify({
      contractVersion: 1,
      type: 'update',
      update: { type: 'command-accepted', acceptedSeq: 4, completesMatch: false },
    }),
  )
  expect(caughtUp).toEqual([3])
  expect(updates).toEqual([4])
  expect(states).toEqual(['connecting', 'connected'])
  subscription.stop()
  expect(socket.closeCalls).toBe(1)
})

test('live client stops and requests catch-up for a gapped completing update', () => {
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

  const socket = FakeWebSocket.instances[0]

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
      update: { type: 'command-accepted', acceptedSeq: 4, completesMatch: true },
    }),
  )
  expect(caughtUp).toEqual([4])
  expect(states).toEqual(['connecting', 'completed'])
  expect(socket.closeCalls).toBe(1)
  subscription.stop()
})
