import { describe, expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { RouterContextProvider } from 'react-router'

import { loader } from '@/routes/sparring/matches/finished'
import { cloudflareContext } from '@/server/context.server'

function context(sparring: Partial<Application['sparring']>): RouterContextProvider {
  const provider = new RouterContextProvider()
  // SAFETY: the route under test uses only the supplied finished-list reads.
  provider.set(cloudflareContext, {
    application: { sparring } as Application,
    isProduction: false,
  })

  return provider
}

describe('finished match day route', () => {
  test('accepts a real local date from the route', async () => {
    const calls: unknown[] = []

    const routeContext = context({
      listFinishedMatches: async (...args) => {
        calls.push(args)

        return {
          scope: 'finished',
          matches: [],
          day: '2028-02-29',
          previousDay: null,
          nextDay: null,
          isToday: false,
        }
      },
    })

    const result = await loader({ context: routeContext, params: { day: '2028-02-29' } })

    expect(calls).toEqual([['uk', '2028-02-29']])
    expect(result.page).toMatchObject({ day: '2028-02-29' })
  })

  test('temporarily redirects the bare path to the latest finished day', async () => {
    const routeContext = context({ latestFinishedMatchDay: async () => '2028-02-29' })

    try {
      await loader({ context: routeContext, params: {} })
      throw new Error('Expected the bare finished list to redirect')
    } catch (error) {
      if (!(error instanceof Response)) throw error
      expect(error.status).toBe(302)
      expect(error.headers.get('Location')).toBe('/sparring/matches/finished/2028-02-29/')
    }
  })

  test('rejects impossible or malformed route days before calling application', async () => {
    const routeContext = context({
      listFinishedMatches: async () => {
        throw new Error('Should not reach application')
      },
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
