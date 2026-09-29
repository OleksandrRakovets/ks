import { newCommandId, newMatchId } from '@ks/core'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import {
  captureRpcError,
  initialization,
  initializedRoom,
  makeRoomFinalizing,
  prepareCommand,
} from '../fixtures'

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

test('reads score and command receipts without restoring a damaged checkpoint, but rejects rich reads', async () => {
  const { matchId, stub } = await initializedRoom()
  const accepted = prepareCommand()
  await stub.submitCommand(accepted)
  await runInDurableObject(stub, (_room, state) => {
    state.storage.sql.exec("UPDATE checkpoints SET aggregate_json = '{}' WHERE seq = 1")
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
        await restored.submitCommand(prepareCommand())
      })
    ).message,
  ).toContain('checkpoint storage corruption')
})

test('restores asymmetric game scoring and keeps the effective last command across system-only preparation', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({
    ...initialization(matchId),
    targets: {
      frameTargetPointsBySeat: { A: 2, B: 3 },
      matchTargetFrames: 2,
    },
  })
  await stub.submitCommand(prepareCommand())
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
    latestSeq: 4,
    state: { framesWonBySeat: { A: 0, B: 0 } },
    lastCommand: {
      entry: { acceptedSeq: 4, scoreAfter: { A: 2, B: 0 } },
      correction: {
        type: 'command.correct',
        fixedInput: { targetSeq: 4 },
      },
    },
  })
  expect(
    await restored.submitCommand({
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'frame.award', seat: 'A' },
    }),
  ).toMatchObject({
    _tag: 'accepted',
    acceptedSeq: 5,
    endsMatch: false,
  })
  expect(await restored.getProtocol()).toMatchObject({
    latestSeq: 5,
    state: { framesWonBySeat: { A: 1, B: 0 }, status: 'active' },
    protocolEntries: expect.arrayContaining([
      expect.objectContaining({ acceptedSeq: 5, entryType: 'frame-awarded', seat: 'A' }),
    ]),
  })
  const controls = await restored.getControls()

  if (!('lastCommand' in controls)) throw new Error('Expected active controls')
  expect(controls.lastCommand).toEqual({
    entry: expect.objectContaining({
      acceptedSeq: 5,
      source: 'player',
      entryType: 'player-command',
    }),
  })
  await restored.submitCommand(prepareCommand())
  await evictDurableObject(restored)
  expect(await env.MATCH_ROOM.getByName(matchId).getControls()).toMatchObject({
    latestSeq: 6,
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
  await stub.submitCommand(prepareCommand())
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
  ).toEqual({ _tag: 'accepted', acceptedSeq: 4, endsMatch: false })
  const restoredProtocol = await restored.getProtocol()
  expect(restoredProtocol).toMatchObject({
    _tag: 'active',
    latestSeq: 4,
    state: { frames: [{ pointsBySeat: { A: 0, B: 1 } }] },
  })
  expect(
    restoredProtocol.protocolEntries
      .filter((entry) => entry.acceptedSeq === 4)
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
  ).toEqual({ _tag: 'accepted', acceptedSeq: 5, endsMatch: true })
  await evictDurableObject(winnerDetermined)

  const finalizing = env.MATCH_ROOM.getByName(matchId)
  const transfer = await runInDurableObject(finalizing, (room) => room.prepareArchive())
  expect(transfer).toMatchObject({
    matchId,
    gameKey: 'strila-v2',
    sourceLatestSeq: 5,
    finalState: {
      status: 'finished',
      framesWonBySeat: { A: 0, B: 1 },
      frames: [{ winnerSeat: 'B', pointsBySeat: { A: 0, B: 1 } }],
    },
  })
  expect(
    transfer.protocolEntries
      .filter((entry) => entry.acceptedSeq === 5)
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
    latestSeq: 3,
    state: { status: 'finished', framesWonBySeat: { A: 1, B: 0 } },
    endedAt: expect.any(Number),
  })
  expect(await stub.getScore()).toEqual({
    _tag: 'finalizing',
    latestSeq: 3,
    endedAt: controls.endedAt,
    score: {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 1, B: 0 },
      singleFramePointsBySeat: { A: 0, B: 0 },
      activeFrame: null,
    },
  })
})
