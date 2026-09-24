import { evictDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import { initializedRoom, makeRoomFinalizing, prepareCommand } from '../fixtures'

test('returns Protocol at sequence zero and restores accepted entries after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  expect(await stub.getProtocol()).toMatchObject({ _tag: 'active', latestSeq: 0, protocolEntries: [] })
  await stub.submitCommand(prepareCommand())
  const warm = await stub.getProtocol()
  await evictDurableObject(stub)
  const restored = await env.MATCH_ROOM.getByName(matchId).getProtocol()
  expect(restored).toEqual(warm)
  expect(restored).toMatchObject({
    _tag: 'active',
    latestSeq: 1,
    protocolEntries: [
      {
        acceptedSeq: 1,
        entryIndex: 0,
        source: 'system',
        entryType: 'frame-prepared',
        frameIndex: 1,
        seat: 'A',
        body: { targetPointsBySeat: { A: 8, B: 8 } },
      },
    ],
  })
})

test('returns finalizing after a match-ending acceptance', async () => {
  const { stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  expect(await stub.getProtocol()).toEqual({ _tag: 'finalizing' })
})
