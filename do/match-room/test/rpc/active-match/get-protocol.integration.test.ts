import { env, evictDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import { finalizeRoom, initializedRoom, prepareCommand } from '../fixtures'

test('returns Protocol at sequence zero and restores accepted entries after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  expect(await stub.getProtocol()).toMatchObject({ _tag: 'active', latestSeq: 0, protocolEntries: [] })
  await stub.submitCommand(prepareCommand())
  await evictDurableObject(stub)
  expect(await env.MATCH_ROOM.getByName(matchId).getProtocol()).toMatchObject({
    _tag: 'active',
    latestSeq: 1,
    protocolEntries: [{ acceptedSeq: 1 }],
  })
})

test('returns finalizing after terminal acceptance', async () => {
  const { stub } = await initializedRoom()
  await finalizeRoom(stub)
  expect(await stub.getProtocol()).toEqual({ _tag: 'finalizing' })
})
