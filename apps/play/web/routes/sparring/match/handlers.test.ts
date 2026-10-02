import { describe, expect, test } from 'bun:test'

import {
  ApplicationStorageError,
  InvalidMatchCommand,
  MatchCommandIdConflict,
  MatchCommandRejected,
  MatchFinished,
  MatchLocked,
  MatchNotFound,
} from '@ks/application/server'
import { type MatchCommand, newCommandId, newMatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { Effect } from 'effect'

import { sparringContext } from '@/server/context.fixtures'

import { commandMatchAction, loadMatchPage, loadMatchProtocolPage } from './handlers'

describe('commandMatchAction adaptation', () => {
  test.each(['{', 'null', '[]', '{"source":"match","command":{}}'])(
    'rejects malformed command JSON %s before application execution',
    async (payload) => {
      const form = new FormData()
      form.set('command', payload)

      const context = sparringContext({
        submitMatchCommand: () => {
          throw new Error('Malformed command reached application')
        },
      })

      expect(
        await commandMatchAction(
          {
            params: { matchId: newMatchId() },
            request: new Request('http://localhost', { method: 'POST', body: form }),
            context,
          },
          'free-pyramid',
        ),
      ).toEqual({ ok: false, errorKey: keys.match.control.invalidCommandPayload })
    },
  )

  test('strips envelope extras but preserves nested game input', async () => {
    const commandId = newCommandId()
    const submitted: (typeof MatchCommand.Type)[] = []

    const context = sparringContext({
      submitMatchCommand: (_matchId, command) => {
        submitted.push(command)

        return Effect.succeed({ acceptedSeq: 9 })
      },
    })

    const form = new FormData()
    form.set(
      'command',
      JSON.stringify({
        commandId,
        source: 'game',
        extra: 'discard',
        command: { type: 'pot.record', seat: 'B', pottedBalls: [0, 3], custom: 7 },
      }),
    )

    expect(
      await commandMatchAction(
        {
          params: { matchId: newMatchId() },
          request: new Request('http://localhost', { method: 'POST', body: form }),
          context,
        },
        'strila-v2',
      ),
    ).toEqual({ ok: true, acceptedSeqMax: 9 })
    expect(submitted).toEqual([
      {
        commandId,
        source: 'game',
        command: { type: 'pot.record', seat: 'B', pottedBalls: [0, 3], custom: 7 },
      },
    ])
  })

  test.each([
    [new MatchFinished(), keys.match.control.matchLocked],
    [new MatchLocked(), keys.match.control.matchLocked],
    [new InvalidMatchCommand(), keys.match.control.invalidCommandPayload],
    [new MatchCommandIdConflict(), keys.match.control.invalidCommandPayload],
  ] as const)('maps %s to its control error', async (reason, errorKey) => {
    const context = sparringContext({ submitMatchCommand: () => Effect.fail(reason) })

    expect(
      await commandMatchAction(
        { params: { matchId: newMatchId() }, request: commandRequest(), context },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, errorKey })
  })

  test('throws HTTP 404 for unknown-match', async () => {
    const context = sparringContext({
      submitMatchCommand: () => Effect.fail(new MatchNotFound()),
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
      submitMatchCommand: () => Effect.succeed({ acceptedSeq: 5 }),
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
        Effect.fail(new MatchCommandRejected({ reason: { code: 'wrong-breaker', expectedSeat: 'B' } })),
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
      readMatch: () => Effect.fail(new MatchNotFound()),
      readMatchProtocol: () => Effect.fail(new MatchNotFound()),
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

  test('maps storage failures to generic HTTP 500 without catching defects', async () => {
    const storageCause = new Error('private SQL diagnostic')

    const context = sparringContext({
      readMatch: () => Effect.fail(new ApplicationStorageError({ cause: storageCause })),
    })

    const originalError = console.error
    const diagnostics: unknown[][] = []
    console.error = (...args) => {
      diagnostics.push(args)
    }

    try {
      const response = await handlerFailure(() =>
        loadMatchPage(
          {
            params: { matchId: newMatchId() },
            request: new Request('http://localhost'),
            context,
          },
          'free-pyramid',
        ),
      )

      expect(response).toBeInstanceOf(Response)
      expect(response).toMatchObject({ status: 500 })
      expect(response instanceof Response && (await response.text())).toBe('Internal server error')
      expect(diagnostics[0]?.[1]).toMatchObject({ cause: storageCause })
    } finally {
      console.error = originalError
    }
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
