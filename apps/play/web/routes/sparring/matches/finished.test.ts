import { describe, expect, test } from 'bun:test'

import { Effect } from 'effect'

import { sparringContext } from '@/server/context.fixtures'

import { loader } from './finished'

describe('finished match day route', () => {
  test('forwards the requested day and defaults when absent', async () => {
    const calls: unknown[] = []

    const routeContext = sparringContext({
      listFinishedMatches: (...args) =>
        Effect.sync(() => {
          calls.push(args)

          return {
            scope: 'finished' as const,
            matches: [],
            day: '2028-02-29',
            previousDay: null,
            nextDay: null,
            isToday: false,
          }
        }),
    })

    const result = await loader({ context: routeContext, params: { day: '2028-02-29' } })
    await loader({ context: routeContext, params: {} })

    expect(calls).toEqual([
      ['uk', '2028-02-29'],
      ['uk', undefined],
    ])
    expect(result.page).toMatchObject({ day: '2028-02-29' })
  })

  test('maps an invalid day to HTTP 404 before calling application', async () => {
    const routeContext = sparringContext({
      listFinishedMatches: () => Effect.die(new Error('Should not reach SparringService')),
    })

    try {
      await loader({ context: routeContext, params: { day: '2026-02-30' } })
      throw new Error('Expected invalid match list day to be rejected')
    } catch (error) {
      expect(error).toMatchObject({ status: 404 })
    }
  })
})
