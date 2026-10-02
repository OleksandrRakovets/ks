import { expect, test } from 'bun:test'

import { CommandReceiptOutcome } from '@ks/application'
import { newCommandId, newMatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { Effect } from 'effect'

import { sparringContext } from '@/server/context.fixtures'

import { commandMatchAction } from './handlers'

test('sends an identified correction through the existing action and names a stale-target rejection', async () => {
  const matchId = newMatchId()

  const submitted = {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'command.correct', targetSeq: 5, targetCommandId: newCommandId() },
  }

  const context = sparringContext({
    submitMatchCommand: (id, command, gameKey) =>
      Effect.sync(() => {
        expect([id, command, gameKey]).toEqual([matchId, submitted, 'free-pyramid'])

        return CommandReceiptOutcome.rejected({ reason: { code: 'correction-not-available' } })
      }),
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
