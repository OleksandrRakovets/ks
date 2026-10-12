import { describe, expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { newCommandId, newMatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { RouterContextProvider } from 'react-router'

import { type AppLoadContext, cloudflareContext } from '@/server/context.server'

import { loadMatchPage, loadMatchProtocolPage, matchAction } from './handlers'

function makeContext(sparring: Partial<Application['sparring']>): AppLoadContext {
  const provider = new RouterContextProvider()
  // SAFETY: each test supplies the Application operation used by the route under test.
  provider.set(cloudflareContext, { application: { sparring } as Application, isProduction: false })

  return provider
}

describe('matchAction adaptation', () => {
  test.each([
    [{ ok: true } as const, 303],
    [{ ok: false, reason: 'unknown-match' } as const, 404],
    [{ ok: false, reason: 'match-locked' } as const, null],
  ])('adapts discard intent result %j', async (result, status) => {
    const context = makeContext({ discardMatch: async () => result })
    const form = new FormData()
    form.set('intent', 'discard')

    const operation = () =>
      matchAction(
        {
          params: { matchId: newMatchId() },
          request: new Request('http://localhost', { method: 'POST', body: form }),
          context,
        },
        'free-pyramid',
      )

    const outcome = status === 404 ? await handlerFailure(operation) : await operation()

    if (status === null) expect(outcome).toEqual({ ok: false, errorKey: keys.match.control.matchLocked })
    else {
      expect(outcome).toMatchObject({ status })

      if (outcome instanceof Response && status === 303)
        expect(outcome.headers.get('Location')).toBe('/sparring/matches/')
    }
  })

  test.each(['other', 'ambiguous', 'duplicate'])(
    'rejects %s discard intent without performing a write',
    async (intent) => {
      const form = new FormData()
      form.set('intent', intent === 'other' ? 'other' : 'discard')

      if (intent === 'ambiguous') form.set('command', '{}')

      if (intent === 'duplicate') form.append('intent', 'other')
      expect(
        await matchAction(
          {
            params: { matchId: newMatchId() },
            request: new Request('http://localhost', { method: 'POST', body: form }),
            context: makeContext({}),
          },
          'free-pyramid',
        ),
      ).toEqual({ ok: false, errorKey: keys.match.control.invalidCommandPayload })
    },
  )

  test.each([
    ['match-finished', keys.match.control.matchLocked],
    ['match-locked', keys.match.control.matchLocked],
    ['invalid-command', keys.match.control.invalidCommandPayload],
    ['command-id-conflict', keys.match.control.invalidCommandPayload],
  ] as const)('maps %s to its control error', async (reason, errorKey) => {
    const context = makeContext({ submitMatchCommand: async () => ({ ok: false, reason }) })

    expect(
      await matchAction(
        { params: { matchId: newMatchId() }, request: commandRequest(), context },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, errorKey })
  })

  test('throws HTTP 404 for unknown-match', async () => {
    const context = makeContext({
      submitMatchCommand: async () => ({ ok: false, reason: 'unknown-match' }),
    })

    expect(
      await handlerFailure(() =>
        matchAction({ params: { matchId: newMatchId() }, request: commandRequest(), context }, 'free-pyramid'),
      ),
    ).toMatchObject({ status: 404 })
  })

  test('returns acceptedSeqMax for accepted outcomes', async () => {
    const matchId = newMatchId()
    const commandId = newCommandId()

    const context = makeContext({
      submitMatchCommand: async () => ({
        ok: true,
        outcome: {
          _tag: 'accepted',
          acceptedSeq: 5,
        },
      }),
    })

    const form = new FormData()
    form.set(
      'command',
      JSON.stringify({ commandId, source: 'match', command: { type: 'frame.commence', seat: 'A' } }),
    )

    const result = await matchAction(
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

    const context = makeContext({
      submitMatchCommand: async () => ({
        ok: true,
        outcome: { _tag: 'rejected', reason: { code: 'wrong-breaker', expectedSeat: 'B' } },
      }),
    })

    const form = new FormData()
    form.set(
      'command',
      JSON.stringify({ commandId, source: 'match', command: { type: 'frame.commence', seat: 'A' } }),
    )

    const result = await matchAction(
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

describe('match and Protocol loader failures', () => {
  test('maps unknown-match to HTTP 404 on both pages', async () => {
    const context = makeContext({
      readMatch: async () => ({ ok: false, reason: 'unknown-match' }),
      readMatchProtocol: async () => ({ ok: false, reason: 'unknown-match' }),
    })

    for (const load of [loadMatchPage, loadMatchProtocolPage])
      expect(
        await handlerFailure(() =>
          load(
            { params: { matchId: newMatchId() }, request: new Request('http://localhost'), context },
            'free-pyramid',
          ),
        ),
      ).toMatchObject({ status: 404 })
  })

  test('propagates archive defects without turning them into HTTP outcomes', async () => {
    const defect = new Error('archive defect')

    const context = makeContext({
      readMatch: async () => {
        throw defect
      },
      readMatchProtocol: async () => {
        throw defect
      },
    })

    for (const load of [loadMatchPage, loadMatchProtocolPage])
      expect(
        await handlerFailure(() =>
          load(
            { params: { matchId: newMatchId() }, request: new Request('http://localhost'), context },
            'free-pyramid',
          ),
        ),
      ).toBe(defect)
  })
})

function commandRequest(): Request {
  const form = new FormData()
  form.set(
    'command',
    JSON.stringify({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'frame.commence', seat: 'A' },
    }),
  )

  return new Request('http://localhost', { method: 'POST', body: form })
}

async function handlerFailure(operation: () => Promise<object>): Promise<Error | Response> {
  try {
    await operation()
  } catch (error) {
    if (!(error instanceof Error) && !(error instanceof Response)) throw error

    return error
  }

  throw new Error('Expected handler to reject')
}
