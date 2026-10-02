import { expect, test } from 'bun:test'

import type { CreateSparringMatchInput } from '@ks/application'
import { InvalidMatchInput, MatchInitializationConflict } from '@ks/application/server'
import { newMatchId } from '@ks/core'
import { Effect } from 'effect'
import { RouterContextProvider } from 'react-router'

import { matchSetupUrl } from '@/features/sparring/urls'
import { sparringContext } from '@/server/context.fixtures'

import { createSetupMatch, loadSetupPage } from './handlers'

test.each([
  [new InvalidMatchInput(), 400],
  [new MatchInitializationConflict(), 409],
] as const)('setup maps %s to HTTP %i', async (reason, status) => {
  const context = sparringContext({
    createMatch: () => Effect.fail(reason),
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

test.each([
  ['strila-v2', 15, 21],
  ['free-pyramid', 16, 21],
  ['free-pyramid-long', 102, 1],
  ['combined-pyramid', 16, 21],
  ['combined-pyramid-old', 16, 21],
] as const)(
  'setup does not enforce page target caps on the server for %s',
  async (gameKey, targetA, matchTargetFrames) => {
    const inputs: (typeof CreateSparringMatchInput.Type)[] = []

    const context = sparringContext({
      createMatch: (input) =>
        Effect.sync(() => inputs.push(input)).pipe(Effect.flatMap(() => Effect.fail(new InvalidMatchInput()))),
    })

    const form = new FormData()
    form.set('seatAName', 'Alice')
    form.set('seatBName', 'Bob')
    form.set('matchTargetFrames', String(matchTargetFrames))
    form.set('targetA', String(targetA))
    form.set('targetB', '1')
    form.set('firstBreakerSeat', 'B')

    if (gameKey === 'free-pyramid-long') form.set('rackRollover', '14')

    try {
      await createSetupMatch({
        params: { gameKey },
        request: new Request('http://localhost', { method: 'POST', body: form }),
        context,
      })
      throw new Error('Expected application rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(Response)

      if (!(error instanceof Response)) throw error

      expect(error.status).toBe(400)
    }

    expect(inputs).toHaveLength(1)
    expect(inputs[0]?.targets).toEqual({
      matchTargetFrames,
      frameTargetPointsBySeat: { A: targetA, B: 1 },
    })
  },
)

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

test.each(['01', '2e1', '2.0', ' 2', 'Infinity'])(
  'rematch ignores non-canonical integer query %s',
  async (target) => {
    const context = new RouterContextProvider()
    const url = new URL('http://localhost/sparring/setup/strila-v2/')

    const ordinary = await loadSetupPage({
      params: { gameKey: 'strila-v2' },
      request: new Request(url),
      context,
    })

    url.search = new URLSearchParams({
      rematch: '1',
      seatAName: 'Alice',
      seatBName: 'Bob',
      matchTargetFrames: '7',
      targetA: '50',
      targetB: target,
    }).toString()
    expect(
      await loadSetupPage({ params: { gameKey: 'strila-v2' }, request: new Request(url), context }),
    ).toEqual(ordinary)
  },
)

test('setup normalizes names before application execution and redirects on success', async () => {
  const inputs: (typeof CreateSparringMatchInput.Type)[] = []
  const matchId = newMatchId()

  const context = sparringContext({
    createMatch: (input) => {
      inputs.push(input)

      return Effect.succeed({ matchId })
    },
  })

  const form = new FormData()
  form.set('seatAName', '  Alice   Smith  ')
  form.set('seatBName', ' Bob\tJones ')
  form.set('matchTargetFrames', '3')
  form.set('targetA', '8')
  form.set('targetB', '6')
  form.set('firstBreakerSeat', 'B')

  const response = await createSetupMatch({
    params: { gameKey: 'strila-v2' },
    request: new Request('http://localhost', { method: 'POST', body: form }),
    context,
  })

  expect(response.status).toBe(302)
  expect(response.headers.get('Location')).toBe(`/sparring/match/strila-v2/${matchId}/`)
  expect(inputs).toEqual([
    {
      gameKey: 'strila-v2',
      playerNames: { A: 'Alice Smith', B: 'Bob Jones' },
      firstBreakerSeat: 'B',
      targets: { matchTargetFrames: 3, frameTargetPointsBySeat: { A: 8, B: 6 } },
    },
  ])
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
