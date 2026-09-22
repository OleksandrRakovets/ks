import { evictDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import { initializedRoom, makeRoomFinalizing, prepareCommand } from '../fixtures'

test('returns active Controls at the authoritative sequence and restores after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  expect(await stub.getControls()).toMatchObject({ _tag: 'active', latestSeq: 0 })
  await stub.submitCommand(prepareCommand())
  await evictDurableObject(stub)
  expect(await env.MATCH_ROOM.getByName(matchId).getControls()).toMatchObject({
    _tag: 'active',
    latestSeq: 1,
    state: {
      currentFrameIndex: 1,
      frames: [{ frameIndex: 1, breakerSeat: 'A', pointsBySeat: { A: 0, B: 0 } }],
    },
  })
})

test('returns the compact score at the authoritative sequence', async () => {
  const { stub } = await initializedRoom()
  await stub.submitCommand(prepareCommand())
  expect(await stub.getScore()).toEqual({
    _tag: 'active',
    latestSeq: 1,
    score: {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 0, B: 0 },
      singleFramePointsBySeat: { A: 0, B: 0 },
      activeFrame: { frameIndex: 1, pointsBySeat: { A: 0, B: 0 } },
    },
  })
})

test('returns finalizing after a match-completing acceptance', async () => {
  const { stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  expect(await stub.getControls()).toEqual({ _tag: 'finalizing' })
  expect(await stub.getScore()).toEqual({ _tag: 'finalizing' })
})
