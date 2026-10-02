import { expect, test } from 'bun:test'

import { newMatchId } from '@ks/core'
import { Effect } from 'effect'

import { sparringContext } from '@/server/context.fixtures'

import { loader } from './api-live-scores'

test('live scores maps unknown-match to HTTP 404 JSON', async () => {
  const matchId = newMatchId()

  const context = sparringContext({
    readMatchScores: (ids) =>
      Effect.sync(() => {
        expect(ids).toEqual([matchId])

        return { ok: false as const, reason: 'unknown-match' as const }
      }),
  })

  const response = await loader({
    request: new Request(`http://localhost/api/sparring-matches/live-scores/?matchId=${matchId}`),
    context,
  })

  expect(response.status).toBe(404)
  expect(response.headers.get('Content-Type')).toContain('application/json')
  expect(await response.text()).toBe('{"error":"Unknown match"}')
})
