import { expect, test } from 'bun:test'

import { MatchNotFound } from '@ks/application/server'
import { Effect } from 'effect'

import { sparringContext } from './context.fixtures'
import { requireRunEffect } from './context.server'

test('requires adapting typed failures before execution without swallowing defects', async () => {
  const runEffect = requireRunEffect(sparringContext({}))
  const failure = new MatchNotFound()

  expect(
    await runEffect(Effect.fail(failure).pipe(Effect.catchTag('MatchNotFound', () => Effect.succeed(404)))),
  ).toBe(404)

  // @ts-expect-error Expected failures cannot cross the Play runner boundary unhandled.
  expect(runEffect(Effect.fail(failure))).rejects.toHaveProperty('_tag', 'MatchNotFound')

  const defect = new Error('unexpected defect')
  expect(runEffect(Effect.die(defect))).rejects.toBe(defect)
})
