import { expect, test } from 'bun:test'

import { MatchFinished, MatchNotFound } from '@ks/application/server'
import { newMatchId } from '@ks/core'
import { Effect } from 'effect'

import { sparringContext } from '@/server/context.fixtures'
import { requireRunEffect } from '@/server/context.server'

import { handleSparringMatchLiveRequest } from '../../../../workers/sparring-match-live'

// SAFETY: these rejection tests return before any Cloudflare binding is accessed.
const env = {} as Cloudflare.Env

test.each([
  'contract=1&view=control&extra=1',
  'contract=1&view=control&view=protocol',
  'contract=1',
  'contract=2&view=control',
  'contract=1&view=unknown',
])('live gateway rejects invalid query %s before admission', async (query) => {
  const runEffect = requireRunEffect(
    sparringContext({
      admitMatchLive: () => {
        throw new Error('Invalid live query reached admission')
      },
    }),
  )

  const request = new Request(`http://localhost/api/sparring-match/${newMatchId()}/live/?${query}`, {
    headers: { Upgrade: 'websocket' },
  })

  const response = await handleSparringMatchLiveRequest(request, env, runEffect)
  expect(response?.status).toBe(400)
  expect(await response?.text()).toBe('Invalid live request')
})

test.each([
  [new MatchNotFound(), 404],
  [new MatchFinished(), 410],
] as const)('live gateway preserves admission failure %s as HTTP %i', async (reason, status) => {
  const runEffect = requireRunEffect(sparringContext({ admitMatchLive: () => Effect.fail(reason) }))

  const request = new Request(
    `http://localhost/api/sparring-match/${newMatchId()}/live/?contract=1&view=protocol`,
    {
      headers: { Upgrade: 'WebSocket' },
    },
  )

  expect((await handleSparringMatchLiveRequest(request, env, runEffect))?.status).toBe(status)
})
