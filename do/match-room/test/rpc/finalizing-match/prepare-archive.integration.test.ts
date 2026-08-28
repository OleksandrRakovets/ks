import { env, evictDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import { captureRpcError, finalizeRoom, initializedRoom } from '../fixtures'

test('throws before terminal acceptance', async () => {
  const { stub } = await initializedRoom()
  expect(
    (
      await captureRpcError(async () => {
        await stub.prepareArchive()
      })
    ).message,
  ).toContain('active Match')
})

test('returns persisted completion without gameplay replay after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  await finalizeRoom(stub)
  await evictDurableObject(stub)
  expect(await env.MATCH_ROOM.getByName(matchId).prepareArchive()).toMatchObject({
    matchId,
    sourceLatestSeq: 3,
    finalState: { status: 'finished' },
  })
})
