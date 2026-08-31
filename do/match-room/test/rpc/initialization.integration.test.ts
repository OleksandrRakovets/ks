import { newMatchId } from '@ks/core'
import { env, evictDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import { captureRpcError, initialization, initializedRoom } from './fixtures'

test('initializes at sequence zero and repeats identical initialization idempotently', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  expect(await stub.initialize(initialization(matchId))).toEqual({ _tag: 'initialized', matchId })
  expect(await stub.initialize(initialization(matchId))).toEqual({ _tag: 'initialized', matchId })
  expect(await stub.getControls()).toMatchObject({ _tag: 'active', latestSeq: 0 })
  expect(await stub.getProtocol()).toMatchObject({ _tag: 'active', latestSeq: 0, protocolEntries: [] })
})

test('rejects routed identity mismatch and conflicting initialization', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  expect(
    (
      await captureRpcError(async () => {
        await stub.initialize(initialization(newMatchId()))
      })
    ).message,
  ).toContain('routed identity')
  await stub.initialize(initialization(matchId))
  expect(
    await stub.initialize({ ...initialization(matchId), controlSecret: 'different-control-secret' }),
  ).toEqual({
    _tag: 'initialization-conflict',
  })
})

test('reconstructs after eviction without reinitializing', async () => {
  const { matchId, stub } = await initializedRoom()
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.getControls()).toMatchObject({ _tag: 'active', latestSeq: 0 })
  expect(await restored.initialize(initialization(matchId))).toEqual({ _tag: 'initialized', matchId })
})
