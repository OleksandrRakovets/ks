import { env, evictDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import { captureRpcError, finalizeRoom, initializedRoom } from '../fixtures'

test('throws before terminal acceptance', async () => {
  const { stub } = await initializedRoom()
  expect(
    (
      await captureRpcError(async () => {
        await stub.dispose()
      })
    ).message,
  ).toContain('active Match')
})

test('retries on the same instance and after deletion plus eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  await finalizeRoom(stub)
  await expect(stub.dispose()).resolves.toBeUndefined()
  await expect(stub.dispose()).resolves.toBeUndefined()
  await evictDurableObject(stub)
  await expect(env.MATCH_ROOM.getByName(matchId).dispose()).resolves.toBeUndefined()
})
