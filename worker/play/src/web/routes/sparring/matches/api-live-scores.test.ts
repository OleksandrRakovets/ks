import { expect, test } from 'bun:test'

import type { Application } from '@ks/application'
import { newMatchId } from '@ks/core'
import { RouterContextProvider } from 'react-router'

import { loader } from '@/routes/sparring/matches/api-live-scores'
import { cloudflareContext } from '@/server/context.server'

test('live scores maps unknown-match to HTTP 404 JSON', async () => {
  const matchId = newMatchId()
  const context = new RouterContextProvider()
  // SAFETY: this loader uses only readMatchScores.
  context.set(cloudflareContext, {
    application: {
      sparring: {
        readMatchScores: async (ids) => {
          expect(ids).toEqual([matchId])

          return { ok: false, reason: 'unknown-match' }
        },
      },
    } as Application,
    isProduction: false,
  })

  const response = await loader({
    request: new Request(`http://localhost/api/sparring-matches/live-scores/?matchId=${matchId}`),
    context,
  })

  expect(response.status).toBe(404)
  expect(response.headers.get('Content-Type')).toContain('application/json')
  expect(await response.text()).toBe('{"error":"Unknown match"}')
})
