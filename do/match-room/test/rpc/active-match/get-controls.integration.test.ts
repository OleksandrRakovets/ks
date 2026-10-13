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

test('updates the compact score with each accepted command and restores it after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
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
  await stub.submitCommand(commenceCommand())
  expect(
    await stub.submitCommand({
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
    }),
  ).toEqual({ _tag: 'accepted', acceptedSeq: 2, endsMatch: false })

  const afterPot = {
    _tag: 'active',
    latestSeq: 2,
    score: {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 0, B: 0 },
      winnerSeat: null,
      singleFramePointsBySeat: { A: 1, B: 0 },
      activeFrame: { frameIndex: 1, pointsBySeat: { A: 1, B: 0 } },
    },
  }

  expect(await stub.getScore()).toEqual(afterPot)
  await evictDurableObject(stub)
  expect(await env.MATCH_ROOM.getByName(matchId).getScore()).toEqual(afterPot)
})

test('reads score and receipts but rejects rich reads with a damaged checkpoint', async () => {
  const { matchId, stub } = await initializedRoom()
  const accepted = commenceCommand()
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
  await stub.submitCommand(commenceCommand())
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

  expect(await restored.submitCommand(award)).toEqual({ _tag: 'accepted', acceptedSeq: 4, endsMatch: false })
  const protocol = await restored.getProtocol()

  if (protocol._tag !== 'active') throw new Error('Expected active Protocol')
  expect(
    protocol.protocolEntries
      .filter((entry) => entry.acceptedSeq === 4)
      .map(({ entryIndex, entryType, causedByCommandId }) => ({ entryIndex, entryType, causedByCommandId })),
  ).toEqual([
    { entryIndex: 0, entryType: 'player-command', causedByCommandId: award.commandId },
    { entryIndex: 1, entryType: 'frame-awarded', causedByCommandId: award.commandId },
    { entryIndex: 2, entryType: 'frame-prepared', causedByCommandId: award.commandId },
  ])
  const controls = await restored.getControls()

  if (!('lastCommand' in controls)) throw new Error('Expected active controls')
  expect(controls).toMatchObject({
    latestSeq: 4,
    state: { status: 'active', currentFrameIndex: 2, framesWonBySeat: { A: 1, B: 0 } },
  })
  expect(controls.lastCommand).toEqual({
    entry: expect.objectContaining({
      acceptedSeq: 4,
      entryIndex: 0,
      source: 'player',
      entryType: 'player-command',
    }),
  })
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
  expect(await next.getControls()).toEqual(controls)
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

  if (controls._tag !== 'finalizing') throw new Error('Expected finalizing controls')
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
