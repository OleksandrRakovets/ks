import { expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { newCommandId, newMatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { RouterContextProvider } from 'react-router'

import { cloudflareContext } from '@/server/context'

import { commandMatchAction } from './handlers'

test('sends an identified correction through the existing action and names a stale-target rejection', async () => {
  const matchId = newMatchId()

  const submitted = {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'command.correct', targetSeq: 5, targetCommandId: newCommandId() },
  }

  const context = new RouterContextProvider()
  // SAFETY: the test supplies the only Application operation used by this route.
  context.set(cloudflareContext, {
    application: {
      sparring: {
        submitMatchCommand: async (id, command, gameKey) => {
          expect([id, command, gameKey]).toEqual([matchId, submitted, 'free-pyramid'])

          return { ok: true, outcome: { _tag: 'rejected', reason: { code: 'correction-not-available' } } }
        },
      },
    } as Application,
    isProduction: false,
  })
  const form = new FormData()
  form.set('command', JSON.stringify(submitted))

  const result = await commandMatchAction(
    {
      params: { matchId },
      request: new Request('http://localhost', { method: 'POST', body: form }),
      context,
    },
    'free-pyramid',
  )

  expect(result).toEqual({ ok: false, errorKey: keys.match.control.correctionUnavailable })
})
