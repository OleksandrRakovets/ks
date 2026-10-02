import { describe, expect, test } from 'bun:test'

import { CommandReceiptOutcome } from '@ks/application'
import { newCommandId, newMatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { Effect } from 'effect'

import { sparringContext } from '@/server/context.fixtures'

import { commandMatchAction, loadMatchPage, loadMatchProtocolPage } from './handlers'

describe('commandMatchAction adaptation', () => {
  test.each([
    ['match-finished', keys.match.control.matchLocked],
    ['match-locked', keys.match.control.matchLocked],
    ['invalid-command', keys.match.control.invalidCommandPayload],
    ['command-id-conflict', keys.match.control.invalidCommandPayload],
  ] as const)('maps %s to its control error', async (reason, errorKey) => {
    const context = sparringContext({ submitMatchCommand: () => Effect.succeed({ ok: false, reason }) })

    expect(
      await commandMatchAction(
        { params: { matchId: newMatchId() }, request: commandRequest(), context },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, errorKey })
  })

  test('throws HTTP 404 for unknown-match', async () => {
    const context = sparringContext({
      submitMatchCommand: () => Effect.succeed({ ok: false, reason: 'unknown-match' }),
    })

    expect(
      await handlerFailure(() =>
        commandMatchAction(
          { params: { matchId: newMatchId() }, request: commandRequest(), context },
          'free-pyramid',
        ),
      ),
    ).toMatchObject({ status: 404 })
  })

  test('returns acceptedSeqMax for accepted outcomes', async () => {
    const matchId = newMatchId()
    const commandId = newCommandId()

    const context = sparringContext({
      submitMatchCommand: () =>
        Effect.succeed({
          ok: true,
          outcome: CommandReceiptOutcome.accepted({ acceptedSeq: 5 }),
        }),
    })

    const form = new FormData()
    form.set(
      'command',
      JSON.stringify({ commandId, source: 'match', command: { type: 'frame.commence', seat: 'A' } }),
    )

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

    const context = sparringContext({
      submitMatchCommand: () =>
        Effect.succeed({
          ok: true,
          outcome: CommandReceiptOutcome.rejected({ reason: { code: 'wrong-breaker', expectedSeat: 'B' } }),
        }),
    })

    const form = new FormData()
    form.set(
      'command',
      JSON.stringify({ commandId, source: 'match', command: { type: 'frame.commence', seat: 'A' } }),
    )

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

describe('match and Protocol loader failures', () => {
  test('maps unknown-match to HTTP 404 on both pages', async () => {
    const context = sparringContext({
      readMatch: () => Effect.succeed({ ok: false, reason: 'unknown-match' }),
      readMatchProtocol: () => Effect.succeed({ ok: false, reason: 'unknown-match' }),
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

    const context = sparringContext({
      readMatch: () => Effect.die(defect),
      readMatchProtocol: () => Effect.die(defect),
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
