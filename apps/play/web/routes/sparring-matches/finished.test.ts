import { describe, expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { RouterContextProvider } from 'react-router'

import { cloudflareContext } from '../../server/context'
import { loader } from './finished'

function context(listFinishedMatches: Application['listFinishedMatches']): RouterContextProvider {
  const provider = new RouterContextProvider()
  // SAFETY: the route under test uses only listFinishedMatches.
  provider.set(cloudflareContext, { application: { listFinishedMatches } as Application })

  return provider
}

describe('finished match day route', () => {
  test('accepts a real local date from the route and defaults when absent', async () => {
    const calls: unknown[] = []

    const routeContext = context(async (...args) => {
      calls.push(args)

      return {
        scope: 'finished',
        matches: [],
        day: '2028-02-29',
        previousDay: null,
        nextDay: null,
        isToday: false,
      }
    })

    const result = await loader({ context: routeContext, params: { day: '2028-02-29' } })
    await loader({ context: routeContext, params: {} })

    expect(calls).toEqual([
      ['uk', '2028-02-29'],
      ['uk', undefined],
    ])
    expect(result.page).toMatchObject({ day: '2028-02-29' })
  })

  test('rejects impossible or malformed route days before calling application', async () => {
    const routeContext = context(async () => {
      throw new Error('Should not reach application')
    })

    for (const day of ['2026-02-30', '2026-9-23', 'foo']) {
      try {
        await loader({ context: routeContext, params: { day } })
        throw new Error('Expected invalid match list day to be rejected')
      } catch (error) {
        expect(error).toMatchObject({ status: 404 })
      }
    }
  })
})
