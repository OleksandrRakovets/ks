import { describe, expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { newCommandId, newMatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { RouterContextProvider } from 'react-router'

import { type AppLoadContext, cloudflareContext } from '../../server/context'
import {
  commandMatchAction,
  type ControlLiveEvent,
  type ControlLiveSource,
  type ControlLiveState,
  subscribeControlLive,
  transitionControlLive,
} from './shared'

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
      { params: { matchId }, request: new Request('http://localhost', { method: 'POST', body: form }), context },
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
      { params: { matchId }, request: new Request('http://localhost', { method: 'POST', body: form }), context },
      'free-pyramid',
    )
    expect(result).toEqual({ ok: false, errorKey: keys.match.control.commandRejectedByRules })
  })
})

describe('control live transitions', () => {
  test('ready confirms without advancing and ordinary newer updates revalidate', () => {
    const ready = transitionControlLive(initial, { type: 'ready', seq: 5 })
    expect(ready).toEqual({
      state: initial,
      revalidate: false,
      close: false,
    })
    expect(transitionControlLive(ready.state, { type: 'update', seq: 6 }).revalidate).toBe(true)
  })

  test('stale updates do nothing', () => {
    expect(transitionControlLive(initial, { type: 'update', seq: 4 })).toEqual({
      state: initial,
      revalidate: false,
      close: false,
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

  test('match end closes and revalidates even when its sequence is stale', () => {
    expect(transitionControlLive(initial, { type: 'match-ended', seq: 3 })).toEqual({
      state: initial,
      revalidate: true,
      close: true,
    })
  })

  test('stream errors revalidate without closing', () => {
    expect(transitionControlLive(initial, { type: 'error' })).toEqual({ state: initial, revalidate: true, close: false })
  })
})

class FakeEventSource {
  readonly listeners = new Map<string, Set<(event: Event) => void>>()
  readonly registrations: string[] = []
  readonly removals: string[] = []
  closeCalls = 0

  addEventListener(type: 'ready' | 'ev' | 'error', listener: (event: Event) => void): void {
    this.registrations.push(type)
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: 'ready' | 'ev' | 'error', listener: (event: Event) => void): void {
    this.removals.push(type)
    this.listeners.get(type)?.delete(listener)
  }

  close(): void {
    this.closeCalls += 1
  }

  emit(type: 'ready' | 'ev' | 'error', event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function updateJson(_matchId: ReturnType<typeof newMatchId>, acceptedSeq: number, terminal: boolean): string {
  return JSON.stringify({
    type: 'command-accepted',
    acceptedSeq,
    terminal,
    entries: [{ frameIndex: 1, source: 'system', entryType: terminal ? 'match-ended' : 'frame-prepared', seat: 'A', body: {} }],
  })
}

test('control subscription wires, parses, applies, and cleans up the production stream', () => {
  const matchId = newMatchId()
  const source = new FakeEventSource()
  let createdUrl: string | undefined
  let state = initial
  let revalidations = 0
  const applyEvent = (event: ControlLiveEvent, eventSource: ControlLiveSource) => {
    const transition = transitionControlLive(state, event)
    state = transition.state
    if (transition.close) eventSource.close()
    if (transition.revalidate) revalidations += 1
  }
  const cleanup = subscribeControlLive({
    matchId,
    since: initial.latestSeq,
    createSource: (url) => {
      createdUrl = url
      return source
    },
    applyEvent,
  })

  expect(createdUrl).toBe(`/api/m/${matchId}/stream/?since=4`)
  expect(source.registrations).toEqual(['ready', 'ev', 'error'])

  source.emit('ready', new MessageEvent('ready', { data: JSON.stringify({ latestSeq: 5 }) }))
  expect(state.latestSeq).toBe(4)
  expect(revalidations).toBe(0)

  source.emit('ev', new MessageEvent('ev', { data: updateJson(matchId, 4, false) }))
  expect(state.latestSeq).toBe(4)
  expect(revalidations).toBe(0)

  source.emit('ev', new MessageEvent('ev', { data: updateJson(matchId, 6, false) }))
  expect(state.latestSeq).toBe(6)
  expect(revalidations).toBe(1)

  state = transitionControlLive(state, { type: 'accepted', seq: 8 }).state
  source.emit('ev', new MessageEvent('ev', { data: updateJson(matchId, 8, false) }))
  expect(state.latestSeq).toBe(8)
  expect(revalidations).toBe(1)

  source.emit('ev', new MessageEvent('ev', { data: '{invalid json' }))
  source.emit('ready', new Event('ready'))
  expect(state.latestSeq).toBe(8)
  expect(revalidations).toBe(1)

  source.emit('error', new Event('error'))
  expect(revalidations).toBe(2)

  source.emit('ev', new MessageEvent('ev', { data: updateJson(matchId, 9, true) }))
  expect(state.latestSeq).toBe(9)
  expect(revalidations).toBe(3)
  expect(source.closeCalls).toBe(1)

  cleanup()
  expect(source.removals).toEqual(['ready', 'ev', 'error'])
  expect(source.closeCalls).toBe(2)
  source.emit('error', new Event('error'))
  expect(revalidations).toBe(3)
})
