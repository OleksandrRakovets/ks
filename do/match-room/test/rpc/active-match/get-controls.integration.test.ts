import { env, evictDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import { finalizeRoom, initializedRoom, prepareCommand } from '../fixtures'

test('returns active Controls at the authoritative sequence and restores after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  expect(await stub.getControls()).toMatchObject({ _tag: 'active', latestSeq: 0 })
  await stub.submitCommand(prepareCommand())
  await evictDurableObject(stub)
  expect(await env.MATCH_ROOM.getByName(matchId).getControls()).toMatchObject({ _tag: 'active', latestSeq: 1 })
})

test('returns finalizing after terminal acceptance', async () => {
  const { stub } = await initializedRoom()
  await finalizeRoom(stub)
  expect(await stub.getControls()).toEqual({ _tag: 'finalizing' })
})
