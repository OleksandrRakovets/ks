import { describe, expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { newCommandId, newMatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { RouterContextProvider } from 'react-router'

import { type AppLoadContext, cloudflareContext } from '@/.server/context'

import { commandMatchAction } from './handlers'

function makeContext(sparring: Partial<Application['sparring']>): AppLoadContext {
  const provider = new RouterContextProvider()
  // SAFETY: each test supplies the Application operation used by the route under test.
  provider.set(cloudflareContext, { application: { sparring } as Application, isProduction: false })

  return provider
}

describe('commandMatchAction adaptation', () => {
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

    const context = makeContext({
      submitMatchCommand: async () => ({
        ok: true,
        outcome: { _tag: 'rejected', reason: { code: 'frame-already-active' } },
      }),
    })

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
