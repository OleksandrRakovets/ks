import { newCommandId, newMatchId } from '@ks/core'
import { evictDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import type { MatchRoom } from '../../../src/MatchRoom'
import {
  commenceCommand,
  initialization,
  initializedRoom,
  makeRoomFinalizing,
  prepareCommand,
} from '../fixtures'

test('returns Protocol at sequence zero and restores accepted entries after eviction', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({ ...initialization(matchId), gameKey: 'strila-v2' })
  expect(await stub.getProtocol()).toMatchObject({
    _tag: 'active',
    latestSeq: 0,
    game: undefined,
    protocolEntries: [],
  })
  await stub.submitCommand(prepareCommand())
  await stub.submitCommand(commenceCommand())
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
  })
  const warm = rpcProtocolResult(await stub.getProtocol())
  expect(warm).not.toHaveProperty('controls')
  expect(warm).toMatchObject({ game: { gameKey: 'strila-v2' } })
  await evictDurableObject(stub)
  const restored = rpcProtocolResult(await env.MATCH_ROOM.getByName(matchId).getProtocol())
  expect(restored).toEqual(warm)
  expect(restored).not.toHaveProperty('controls')
  expect(restored).toMatchObject({
    _tag: 'active',
    latestSeq: 3,
    protocolEntries: expect.arrayContaining([
      expect.objectContaining({
        acceptedSeq: 1,
        entryIndex: 0,
        source: 'system',
        entryType: 'frame-prepared',
        frameIndex: 1,
        seat: 'A',
        body: { targetPointsBySeat: { A: 8, B: 8 } },
      }),
      expect.objectContaining({
        acceptedSeq: 3,
        source: 'player',
        body: { commandType: 'pot.record', pottedBalls: [0] },
      }),
    ]),
  })
})

test('serves finalizing state and complete Protocol directly after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  await evictDurableObject(stub)
  const protocol = rpcProtocolResult(await env.MATCH_ROOM.getByName(matchId).getProtocol())

  if (protocol._tag !== 'finalizing') throw new Error('Expected finalizing Protocol')
  expect(
    protocol.protocolEntries.some((entry) => entry.acceptedSeq === 3 && entry.entryType === 'match-ended'),
  ).toBe(true)
  expect(protocol).toMatchObject({
    _tag: 'finalizing',
    latestSeq: 3,
    state: { status: 'finished', framesWonBySeat: { A: 1, B: 0 } },
  })
})

/** Retains the public contract when Cloudflare's Rpc.Result reduces the canonical unknown body to never. */
function rpcProtocolResult(
  result: Awaited<ReturnType<MatchRoom['getProtocol']>>,
): Awaited<ReturnType<MatchRoom['getProtocol']>> {
  return result
}
