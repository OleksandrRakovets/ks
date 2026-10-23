import { newCommandId, newMatchId } from '@ks/core'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import { commenceCommand, initialization, initializedRoom } from '../fixtures'

test('restores a correction and its original command after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  await stub.submitCommand(commenceCommand())

  const previous = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
  }

  await stub.submitCommand(previous)

  const mistaken = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  }

  expect(await stub.submitCommand(mistaken)).toMatchObject({ _tag: 'accepted', acceptedSeq: 3 })

  const correction = {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'command.correct', targetSeq: 3, targetCommandId: mistaken.commandId },
  }

  expect(await stub.submitCommand(correction)).toEqual({ _tag: 'accepted', acceptedSeq: 4, endsMatch: false })
  expect(await stub.submitCommand(correction)).toEqual({ _tag: 'accepted', acceptedSeq: 4, endsMatch: false })
  const controls = await stub.getControls()
  expect(controls).toMatchObject({ _tag: 'active', latestSeq: 4, game: { score: { A: 0, B: 1 } } })
  const protocol = await stub.getProtocol()
  expect(protocol).toMatchObject({
    _tag: 'active',
    latestSeq: 4,
    protocolEntries: expect.arrayContaining([
      expect.objectContaining({ acceptedSeq: 3, source: 'player', seat: 'A', scoreAfter: { A: 1, B: 1 } }),
      expect.objectContaining({
        acceptedSeq: 4,
        source: 'player',
        entryType: 'command-corrected',
        seat: 'A',
        scoreAfter: { A: 0, B: 1 },
        body: { targetSeq: 3, targetCommandId: mistaken.commandId, targetEntryIndex: 0 },
      }),
    ]),
  })

  const second = {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'command.correct', targetSeq: 3, targetCommandId: mistaken.commandId },
  }

  expect(await stub.submitCommand(second)).toEqual({
    _tag: 'rejected',
    reason: { code: 'correction-not-available' },
  })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.getControls()).toEqual(controls)
  expect(await restored.getProtocol()).toEqual(protocol)
  expect(await restored.submitCommand(second)).toEqual({
    _tag: 'rejected',
    reason: { code: 'correction-not-available' },
  })
  expect(await restored.submitCommand(mistaken)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    endsMatch: false,
  })
})

test('continues correcting earlier commands after eviction and keeps every correction in Protocol', async () => {
  const { matchId, stub } = await initializedRoom()
  await stub.submitCommand(commenceCommand())

  const pots = []

  for (let index = 0; index < 3; index += 1) {
    const pot = {
      commandId: newCommandId(),
      source: 'game' as const,
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
    }

    pots.push(pot)
    expect(await stub.submitCommand(pot)).toMatchObject({ _tag: 'accepted', acceptedSeq: index + 2 })
  }

  expect(
    await stub.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetSeq: 4, targetCommandId: pots[2]!.commandId },
    }),
  ).toMatchObject({ _tag: 'accepted', acceptedSeq: 5 })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)

  for (const [index, target] of pots.slice(0, 2).reverse().entries()) {
    expect(
      await restored.submitCommand({
        commandId: newCommandId(),
        source: 'match',
        command: { type: 'command.correct', targetSeq: 3 - index, targetCommandId: target.commandId },
      }),
    ).toMatchObject({ _tag: 'accepted', acceptedSeq: 6 + index })
    expect(await restored.getControls()).toMatchObject({
      latestSeq: 6 + index,
      game: { score: { A: 1 - index, B: 0 } },
      lastCommand: { entry: { acceptedSeq: 2 - index } },
    })
  }

  const protocol = await restored.getProtocol()
  expect(protocol).toMatchObject({
    latestSeq: 7,
    protocolEntries: expect.arrayContaining([
      expect.objectContaining({ acceptedSeq: 5, entryType: 'command-corrected' }),
      expect.objectContaining({ acceptedSeq: 6, entryType: 'command-corrected' }),
      expect.objectContaining({ acceptedSeq: 7, entryType: 'command-corrected' }),
    ]),
  })
})

test('restores alternating commands and corrections after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  await stub.submitCommand(commenceCommand())

  for (let index = 0; index < 4; index += 1) {
    const pot = {
      commandId: newCommandId(),
      source: 'game' as const,
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
    }

    const acceptedSeq = index * 2 + 2
    expect(await stub.submitCommand(pot)).toMatchObject({ _tag: 'accepted', acceptedSeq })
    expect(
      await stub.submitCommand({
        commandId: newCommandId(),
        source: 'match',
        command: { type: 'command.correct', targetSeq: acceptedSeq, targetCommandId: pot.commandId },
      }),
    ).toMatchObject({ _tag: 'accepted', acceptedSeq: acceptedSeq + 1 })
  }

  const controls = await stub.getControls()
  const protocol = await stub.getProtocol()
  expect(controls).toMatchObject({ latestSeq: 9, game: { score: { A: 0, B: 0 } } })
  expect(protocol).toMatchObject({
    latestSeq: 9,
    protocolEntries: Array.from({ length: 9 }, (_, index) => ({ acceptedSeq: index + 1 })),
  })
  await runInDurableObject(stub, (_room, state) => {
    expect(
      state.storage.sql
        .exec<{ seq: number; previous_checkpoint_seq: number }>(
          'SELECT seq, previous_checkpoint_seq FROM checkpoints WHERE seq IN (3, 5, 7, 9) ORDER BY seq',
        )
        .toArray(),
    ).toEqual([
      { seq: 3, previous_checkpoint_seq: 1 },
      { seq: 5, previous_checkpoint_seq: 1 },
      { seq: 7, previous_checkpoint_seq: 1 },
      { seq: 9, previous_checkpoint_seq: 1 },
    ])
  })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.getControls()).toEqual(controls)
  expect(await restored.getProtocol()).toEqual(protocol)
  expect(
    await restored.submitCommand({
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
    }),
  ).toMatchObject({ _tag: 'accepted', acceptedSeq: 10 })
  expect(await restored.getControls()).toMatchObject({ game: { score: { A: 0, B: 1 } } })
})

test('corrects across intervening correction checkpoints without replaying them', async () => {
  const { stub } = await initializedRoom()
  await stub.submitCommand(commenceCommand())

  const earlier = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  }

  const mistaken = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
  }

  await stub.submitCommand(earlier)
  await stub.submitCommand(mistaken)
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'command.correct', targetSeq: 3, targetCommandId: mistaken.commandId },
  })

  const replacement = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
  }

  await stub.submitCommand(replacement)
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'command.correct', targetSeq: 5, targetCommandId: replacement.commandId },
  })
  expect(
    await stub.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetSeq: 2, targetCommandId: earlier.commandId },
    }),
  ).toMatchObject({ _tag: 'accepted', acceptedSeq: 7 })
  expect(await stub.getControls()).toMatchObject({
    latestSeq: 7,
    game: { score: { A: 0, B: 0 } },
    lastCommand: { entry: { acceptedSeq: 1 } },
  })
  await runInDurableObject(stub, (_room, state) => {
    expect(
      state.storage.sql
        .exec<{ seq: number; previous_checkpoint_seq: number }>(
          'SELECT seq, previous_checkpoint_seq FROM checkpoints WHERE seq IN (4, 6, 7) ORDER BY seq',
        )
        .toArray(),
    ).toEqual([
      { seq: 4, previous_checkpoint_seq: 2 },
      { seq: 6, previous_checkpoint_seq: 2 },
      { seq: 7, previous_checkpoint_seq: 1 },
    ])
  })
})

test('persists a multi-entry correction batch and continues correcting after eviction', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({
    ...initialization(matchId),
    gameKey: 'strila-v2',
    targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 1 },
  })
  await stub.submitCommand(commenceCommand())

  const pots = []

  for (let index = 0; index < 3; index += 1) {
    const pot = {
      commandId: newCommandId(),
      source: 'game' as const,
      command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
    }

    pots.push(pot)
    expect(await stub.submitCommand(pot)).toMatchObject({ _tag: 'accepted', acceptedSeq: index + 2 })
  }

  expect(
    await stub.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetSeq: 4, targetCommandId: pots[2]!.commandId },
    }),
  ).toMatchObject({ _tag: 'accepted', acceptedSeq: 5 })
  const protocol = await stub.getProtocol()
  expect(protocol).toMatchObject({
    latestSeq: 5,
    protocolEntries: [
      { acceptedSeq: 1, entryIndex: 0 },
      { acceptedSeq: 2, entryIndex: 0 },
      { acceptedSeq: 3, entryIndex: 0 },
      { acceptedSeq: 4, entryIndex: 0 },
      { acceptedSeq: 4, entryIndex: 1 },
      { acceptedSeq: 5, entryIndex: 0, entryType: 'command-corrected' },
      { acceptedSeq: 5, entryIndex: 1, entryType: 'command-corrected' },
    ],
  })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.getProtocol()).toEqual(protocol)
  expect(
    await restored.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetSeq: 3, targetCommandId: pots[1]!.commandId },
    }),
  ).toMatchObject({ _tag: 'accepted', acceptedSeq: 6 })
  expect(await restored.getControls()).toMatchObject({ latestSeq: 6, game: { score: { A: 1, B: 0 } } })
})

test('rejects a correction behind the latest acceptance without changing the sequence', async () => {
  const { stub } = await initializedRoom()
  await stub.submitCommand(commenceCommand())

  const earlier = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  }

  await stub.submitCommand(earlier)
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
  })
  expect(
    await stub.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetSeq: 2, targetCommandId: earlier.commandId },
    }),
  ).toEqual({ _tag: 'rejected', reason: { code: 'correction-not-available' } })
  expect(await stub.getControls()).toMatchObject({ latestSeq: 3, game: { score: { A: 1, B: 1 } } })
})
