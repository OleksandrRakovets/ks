import { expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { RouterContextProvider } from 'react-router'

import { matchSetupUrl } from '@/features/sparring/urls'
import { cloudflareContext } from '@/server/context.server'

import { createSetupMatch, loadSetupPage } from './handlers'

test.each([
  ['invalid-input', 400],
  ['initialization-conflict', 409],
] as const)('setup maps %s to HTTP %i', async (reason, status) => {
  const context = new RouterContextProvider()
  const sparring: Partial<Application['sparring']> = { createMatch: async () => ({ ok: false, reason }) }
  // SAFETY: this handler uses only createMatch.
  context.set(cloudflareContext, {
    application: { sparring } as Application,
    isProduction: false,
  })
  const form = new FormData()
  form.set('seatAName', 'Alice')
  form.set('seatBName', 'Bob')
  form.set('matchTargetFrames', '3')
  form.set('targetA', '8')
  form.set('targetB', '6')
  form.set('firstBreakerSeat', 'B')

  try {
    await createSetupMatch({
      params: { gameKey: 'strila-v2' },
      request: new Request('http://localhost', { method: 'POST', body: form }),
      context,
    })
    throw new Error('Expected match creation failure')
  } catch (error) {
    expect(error).toBeInstanceOf(Response)

    if (!(error instanceof Response)) throw error

    expect(error.status).toBe(status)
  }
})

test('rematch setup preserves seats and Long Pyramid handicap settings without a breaker', async () => {
  const url = matchSetupUrl('free-pyramid-long', 'uk', {
    playerNames: { A: 'Костянтин Кулик', B: 'Владислав Косогов' },
    targets: {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 50, B: 15 },
    },
    gameConfiguration: { rackRollover: 15 },
  })

  const requestUrl = new URL(url, 'http://localhost')

  expect(requestUrl.searchParams.has('firstBreakerSeat')).toBe(false)
  expect(
    await loadSetupPage({
      params: { gameKey: 'free-pyramid-long' },
      request: new Request(requestUrl),
      context: new RouterContextProvider(),
    }),
  ).toMatchObject({
    initialPlayerNames: { A: 'Костянтин Кулик', B: 'Владислав Косогов' },
    profile: {
      defaultFrameTargetPointsBySeat: { A: 50, B: 15 },
      matchTargetFrames: { mode: 'fixed', fixedValue: 1 },
      rackRollover: { defaultValue: 15 },
    },
  })
})

test('rematch setup preserves editable race length and falls back entirely for malformed values', async () => {
  const context = new RouterContextProvider()

  const validUrl = matchSetupUrl('strila-v2', 'uk', {
    playerNames: { A: 'Alice', B: 'Bob' },
    targets: {
      matchTargetFrames: 7,
      frameTargetPointsBySeat: { A: 50, B: 15 },
    },
  })

  const valid = await loadSetupPage({
    params: { gameKey: 'strila-v2' },
    request: new Request(new URL(validUrl, 'http://localhost')),
    context,
  })

  expect(valid).toMatchObject({
    initialPlayerNames: { A: 'Alice', B: 'Bob' },
    profile: {
      defaultFrameTargetPointsBySeat: { A: 50, B: 15 },
      matchTargetFrames: { mode: 'editable', defaultValue: 7 },
    },
  })

  const ordinary = await loadSetupPage({
    params: { gameKey: 'strila-v2' },
    request: new Request('http://localhost/sparring/setup/strila-v2/'),
    context,
  })

  const malformed = await loadSetupPage({
    params: { gameKey: 'strila-v2' },
    request: new Request(new URL(validUrl.replace('targetB=15', 'targetB=0'), 'http://localhost')),
    context,
  })

  expect(malformed).toEqual(ordinary)
})

test('match setup rejects a cleared frame target instead of restoring its default', async () => {
  const form = new FormData()
  form.set('seatAName', 'Alice')
  form.set('seatBName', 'Bob')
  form.set('matchTargetFrames', '3')
  form.set('targetA', '')
  form.set('targetB', '8')
  form.set('firstBreakerSeat', 'A')

  try {
    await createSetupMatch({
      params: { gameKey: 'strila-v2' },
      request: new Request('http://localhost', { method: 'POST', body: form }),
      context: new RouterContextProvider(),
    })
    throw new Error('Expected invalid match setup')
  } catch (error) {
    expect(error).toBeInstanceOf(Response)

    if (!(error instanceof Response)) throw error

    expect(error.status).toBe(400)
  }
})
