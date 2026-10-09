import { newCommandId, newMatchId } from '@ks/core'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import {
  captureRpcError,
  commenceCommand,
  initialization,
  initializedRoom,
  makeRoomFinalizing,
} from '../fixtures'

test('returns active Controls at the authoritative sequence and restores after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  const initial = await stub.getControls()
  expect(initial).toMatchObject({
    _tag: 'active',
    latestSeq: 0,
    state: { status: 'active', currentFrameIndex: 1 },
    game: { gameKey: 'free-pyramid', details: { phase: 'not-started' } },
    controls: [{ source: 'match', type: 'frame.commence', seat: 'A' }],
  })
  expect(initial).not.toHaveProperty('controlPhase')
  expect(initial).not.toHaveProperty('protocolEntries')
  await evictDurableObject(stub)
  expect(await env.MATCH_ROOM.getByName(matchId).getControls()).toMatchObject({
    _tag: 'active',
    latestSeq: 0,
    state: {
      currentFrameIndex: 1,
      frames: [{ frameIndex: 1, breakerSeat: 'A', pointsBySeat: { A: 0, B: 0 } }],
    },
    game: { gameKey: 'free-pyramid', score: { A: 0, B: 0 }, details: { phase: 'not-started' } },
    controls: [{ source: 'match', type: 'frame.commence', seat: 'A' }],
  })
})

test('returns the compact score at the authoritative sequence', async () => {
  const { stub } = await initializedRoom()
  expect(await stub.getScore()).toEqual({
    _tag: 'active',
    latestSeq: 0,
    score: {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 0, B: 0 },
      winnerSeat: null,
      singleFramePointsBySeat: { A: 0, B: 0 },
      activeFrame: { frameIndex: 1, pointsBySeat: { A: 0, B: 0 } },
    },
  })
})

test.each([
  "UPDATE checkpoints SET aggregate_json = '{}' WHERE seq = 1",
  "UPDATE checkpoints SET aggregate_json = json_set(aggregate_json, '$.gameplay.state.context.futureField', 1) WHERE seq = 1",
])('reads score and receipts but rejects rich reads with damaged checkpoint: %s', async (damage) => {
  const { matchId, stub } = await initializedRoom()
  const accepted = commenceCommand()
  await stub.submitCommand(accepted)
  await runInDurableObject(stub, (_room, state) => {
    state.storage.sql.exec(damage)
  })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.getScore()).toMatchObject({ _tag: 'active', latestSeq: 1 })
  expect(await restored.submitCommand(accepted)).toMatchObject({ _tag: 'accepted', acceptedSeq: 1 })
  expect(
    (
      await captureRpcError(async () => {
        await restored.getProtocol()
      })
    ).message,
  ).toContain('checkpoint storage corruption')
  expect(
    (
      await captureRpcError(async () => {
        await restored.getControls()
      })
    ).message,
  ).toContain('checkpoint storage corruption')
  expect(
    (
      await captureRpcError(async () => {
        await restored.submitCommand(commenceCommand())
      })
    ).message,
  ).toContain('checkpoint storage corruption')
})

test('persists award and next preparation in one acceptance through retries and eviction', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({
    ...initialization(matchId),
    targets: {
      frameTargetPointsBySeat: { A: 2, B: 3 },
      matchTargetFrames: 2,
    },
  })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.getControls()).toMatchObject({
    _tag: 'active',
    latestSeq: 3,
    state: { framesWonBySeat: { A: 0, B: 0 } },
    lastCommand: {
      entry: { acceptedSeq: 3, scoreAfter: { A: 2, B: 0 } },
      correction: {
        type: 'command.correct',
        fixedInput: { targetSeq: 3 },
      },
    },
  })

  const award = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'frame.award', seat: 'A' },
  }

  expect(await restored.submitCommand(award)).toMatchObject({
    _tag: 'accepted',
    acceptedSeq: 4,
    endsMatch: false,
  })
  expect(await restored.getProtocol()).toMatchObject({
    latestSeq: 4,
    state: { framesWonBySeat: { A: 1, B: 0 }, status: 'active' },
    protocolEntries: expect.arrayContaining([
      expect.objectContaining({
        acceptedSeq: 4,
        entryIndex: 0,
        entryType: 'player-command',
        causedByCommandId: award.commandId,
      }),
      expect.objectContaining({
        acceptedSeq: 4,
        entryIndex: 1,
        entryType: 'frame-awarded',
        seat: 'A',
        causedByCommandId: award.commandId,
      }),
      expect.objectContaining({
        acceptedSeq: 4,
        entryIndex: 2,
        entryType: 'frame-prepared',
        frameIndex: 2,
        seat: 'B',
        causedByCommandId: award.commandId,
      }),
    ]),
  })
  const controls = await restored.getControls()

  if (!('lastCommand' in controls)) throw new Error('Expected active controls')
  expect(controls).toMatchObject({
    state: {
      status: 'active',
      currentFrameIndex: 2,
      frames: [
        { winnerSeat: 'A', pointsBySeat: { A: 2, B: 0 } },
        { breakerSeat: 'B', pointsBySeat: { A: 0, B: 0 } },
      ],
    },
    game: { gameKey: 'free-pyramid', score: { A: 0, B: 0 }, details: { phase: 'not-started' } },
    controls: [{ source: 'match', type: 'frame.commence', seat: 'B' }],
  })
  expect(controls.lastCommand).toEqual({
    entry: expect.objectContaining({
      acceptedSeq: 4,
      source: 'player',
      entryType: 'player-command',
    }),
  })
  const protocol = await restored.getProtocol()
  await runInDurableObject(restored, (_room, state) => {
    expect(
      state.storage.sql
        .exec<{ count: number }>('SELECT count(*) AS count FROM commands WHERE accepted_seq IS NOT NULL')
        .one().count,
    ).toBe(4)
    expect(
      state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM checkpoints').one().count,
    ).toBe(5)
  })
  await evictDurableObject(restored)
  const next = env.MATCH_ROOM.getByName(matchId)
  expect(await next.submitCommand(award)).toEqual({ _tag: 'accepted', acceptedSeq: 4, endsMatch: false })
  expect(await next.getProtocol()).toEqual(protocol)
  expect(await next.getControls()).toMatchObject({
    latestSeq: 4,
    state: {
      currentFrameIndex: 2,
      frames: [{ winnerSeat: 'A' }, { breakerSeat: 'B', pointsBySeat: { A: 0, B: 0 } }],
    },
    controls: expect.arrayContaining([expect.objectContaining({ type: 'frame.commence', seat: 'B' })]),
    lastCommand: controls.lastCommand,
  })
})

test('restores nested Strila foul state and archives a natural award after eviction', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({
    ...initialization(matchId),
    gameKey: 'strila-v2',
    targets: { frameTargetPointsBySeat: { A: 2, B: 1 }, matchTargetFrames: 1 },
  })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'foul.commit', seat: 'A' },
  })
  await evictDurableObject(stub)

  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(
    await restored.submitCommand({
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'penalty.select', seat: 'B', choice: 'pass-position' },
    }),
  ).toEqual({ _tag: 'accepted', acceptedSeq: 3, endsMatch: false })
  const restoredProtocol = await restored.getProtocol()
  expect(restoredProtocol).toMatchObject({
    _tag: 'active',
    latestSeq: 3,
    state: { frames: [{ pointsBySeat: { A: 0, B: 1 } }] },
  })
  expect(
    restoredProtocol.protocolEntries
      .filter((entry) => entry.acceptedSeq === 3)
      .map(({ source, entryType, seat, scoreAfter, body }) => ({ source, entryType, seat, scoreAfter, body })),
  ).toEqual([
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      scoreAfter: { A: 0, B: 1 },
      body: { commandType: 'penalty.select', choice: 'pass-position' },
    },
    {
      source: 'system',
      entryType: 'system-note',
      seat: 'B',
      scoreAfter: undefined,
      body: { systemType: 'winner-determined', reason: 'target-reached' },
    },
  ])
  await evictDurableObject(restored)

  const winnerDetermined = env.MATCH_ROOM.getByName(matchId)
  expect(
    await winnerDetermined.submitCommand({
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'frame.award', seat: 'B' },
    }),
  ).toEqual({ _tag: 'accepted', acceptedSeq: 4, endsMatch: true })
  await evictDurableObject(winnerDetermined)

  const finalizing = env.MATCH_ROOM.getByName(matchId)
  const transfer = await runInDurableObject(finalizing, (room) => room.prepareArchive())
  expect(transfer).toMatchObject({
    matchId,
    gameKey: 'strila-v2',
    sourceLatestSeq: 4,
    finalState: {
      status: 'finished',
      framesWonBySeat: { A: 0, B: 1 },
      frames: [{ winnerSeat: 'B', pointsBySeat: { A: 0, B: 1 } }],
    },
  })
  expect(
    transfer.protocolEntries
      .filter((entry) => entry.acceptedSeq === 4)
      .map(({ source, entryType, seat, body }) => ({ source, entryType, seat, body })),
  ).toEqual([
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      body: { commandType: 'frame.award' },
    },
    {
      source: 'system',
      entryType: 'frame-awarded',
      seat: 'B',
      body: { winReason: 'game-rules' },
    },
    { source: 'system', entryType: 'match-ended', seat: 'B', body: {} },
  ])
})

test('returns durable final state and score after a match-ending acceptance', async () => {
  const { stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  const controls = await stub.getControls()
  expect(controls).toMatchObject({
    _tag: 'finalizing',
    latestSeq: 2,
    state: { status: 'finished', framesWonBySeat: { A: 1, B: 0 } },
    endedAt: expect.any(Number),
  })
  expect(await stub.getScore()).toEqual({
    _tag: 'finalizing',
    latestSeq: 2,
    endedAt: controls.endedAt,
    score: {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 1, B: 0 },
      winnerSeat: 'A',
      singleFramePointsBySeat: { A: 0, B: 0 },
      activeFrame: null,
    },
  })
})
