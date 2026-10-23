import { newMatchId } from '@ks/core'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import { captureRpcError, initialization, initializedRoom } from './fixtures'

test('initializes at sequence zero and repeats identical initialization idempotently', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  expect(await stub.initialize(initialization(matchId))).toEqual({ _tag: 'initialized', matchId })
  expect(await stub.initialize(initialization(matchId))).toEqual({ _tag: 'initialized', matchId })
  expect(await stub.getControls()).toMatchObject({
    _tag: 'active',
    latestSeq: 0,
    state: { currentFrameIndex: 1, frames: [{ breakerSeat: 'A', pointsBySeat: { A: 0, B: 0 } }] },
    controls: expect.arrayContaining([expect.objectContaining({ type: 'frame.commence', seat: 'A' })]),
    lastCommand: null,
  })
  expect(await stub.getProtocol()).toMatchObject({ _tag: 'active', latestSeq: 0, protocolEntries: [] })
  await runInDurableObject(stub, (_room, state) => {
    expect(
      state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM commands').one().count,
    ).toBe(0)
    expect(
      state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM protocol_entries').one().count,
    ).toBe(0)

    const checkpoint = state.storage.sql
      .exec<{ seq: number; aggregate_json: string }>('SELECT seq, aggregate_json FROM checkpoints')
      .one()

    expect(checkpoint.seq).toBe(0)
    expect(JSON.parse(checkpoint.aggregate_json)).toMatchObject({
      lifecycle: { value: 'frame-in-progress', context: { activeFrame: { frameIndex: 1, breakerSeat: 'A' } } },
    })
  })
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

test('reconstructs active Controls after eviction without reinitializing', async () => {
  const { matchId, stub } = await initializedRoom()
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  const controls = await restored.getControls()
  expect(controls).toMatchObject({
    _tag: 'active',
    latestSeq: 0,
    state: {
      status: 'active',
      currentFrameIndex: 1,
      frames: [{ frameIndex: 1, breakerSeat: 'A', pointsBySeat: { A: 0, B: 0 } }],
    },
    game: { gameKey: 'free-pyramid', score: { A: 0, B: 0 }, details: { phase: 'not-started' } },
    controls: [{ source: 'match', type: 'frame.commence', seat: 'A' }],
  })
  expect(controls).not.toHaveProperty('controlPhase')
  expect(controls).not.toHaveProperty('protocolEntries')
  expect(await restored.initialize(initialization(matchId))).toEqual({ _tag: 'initialized', matchId })
})
