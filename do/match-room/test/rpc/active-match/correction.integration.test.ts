import { newCommandId, newMatchId } from '@ks/core'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import {
  commenceCommand,
  initialization,
  initializedRoom,
  matchEndingCommand,
  prepareCommand,
} from '../fixtures'

test('restores a legacy correction and its original command after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  await stub.submitCommand(prepareCommand())
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

  expect(await stub.submitCommand(mistaken)).toMatchObject({ _tag: 'accepted', acceptedSeq: 4 })

  const correction = {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'action.correct', targetSeq: 4, targetCommandId: mistaken.commandId },
  }

  expect(await stub.submitCommand(correction)).toEqual({ _tag: 'accepted', acceptedSeq: 5, endsMatch: false })
  expect(await stub.submitCommand(correction)).toEqual({ _tag: 'accepted', acceptedSeq: 5, endsMatch: false })
  const controls = await stub.getControls()
  expect(controls).toMatchObject({ _tag: 'active', latestSeq: 5, game: { score: { A: 0, B: 1 } } })
  const protocol = await stub.getProtocol()
  expect(protocol).toMatchObject({
    _tag: 'active',
    latestSeq: 5,
    protocolEntries: expect.arrayContaining([
      expect.objectContaining({ acceptedSeq: 4, source: 'player', seat: 'A', scoreAfter: { A: 1, B: 1 } }),
      expect.objectContaining({
        acceptedSeq: 5,
        source: 'player',
        entryType: 'action-corrected',
        seat: 'A',
        scoreAfter: { A: 0, B: 1 },
        body: { targetSeq: 4, targetCommandId: mistaken.commandId, targetEntryIndex: 0 },
      }),
    ]),
  })

  const second = {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'command.correct', targetSeq: 4, targetCommandId: mistaken.commandId },
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
    acceptedSeq: 4,
    endsMatch: false,
  })
})

test('continues correcting earlier commands after eviction and keeps every correction in Protocol', async () => {
  const { matchId, stub } = await initializedRoom()
  await stub.submitCommand(prepareCommand())
  await stub.submitCommand(commenceCommand())

  const pots = []

  for (let index = 0; index < 3; index += 1) {
    const pot = {
      commandId: newCommandId(),
      source: 'game' as const,
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
    }

    pots.push(pot)
    expect(await stub.submitCommand(pot)).toMatchObject({ _tag: 'accepted', acceptedSeq: index + 3 })
  }

  expect(
    await stub.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetSeq: 5, targetCommandId: pots[2]!.commandId },
    }),
  ).toMatchObject({ _tag: 'accepted', acceptedSeq: 6 })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)

  for (const [index, target] of pots.slice(0, 2).reverse().entries()) {
    expect(
      await restored.submitCommand({
        commandId: newCommandId(),
        source: 'match',
        command: { type: 'command.correct', targetSeq: 4 - index, targetCommandId: target.commandId },
      }),
    ).toMatchObject({ _tag: 'accepted', acceptedSeq: 7 + index })
    expect(await restored.getControls()).toMatchObject({ game: { score: { A: 1 - index, B: 0 } } })
  }

  const protocol = await restored.getProtocol()
  expect(protocol).toMatchObject({
    latestSeq: 8,
    protocolEntries: expect.arrayContaining([
      expect.objectContaining({ acceptedSeq: 6, entryType: 'command-corrected' }),
      expect.objectContaining({ acceptedSeq: 7, entryType: 'command-corrected' }),
      expect.objectContaining({ acceptedSeq: 8, entryType: 'command-corrected' }),
    ]),
  })
})

test('persists the third cue-ball pot and system-foul corrections as one stack step', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({
    ...initialization(matchId),
    gameKey: 'strila-v2',
    targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 1 },
  })
  await stub.submitCommand(prepareCommand())
  await stub.submitCommand(commenceCommand())

  const pots = []

  for (let index = 0; index < 3; index += 1) {
    const pot = {
      commandId: newCommandId(),
      source: 'game' as const,
      command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
    }

    pots.push(pot)
    expect(await stub.submitCommand(pot)).toMatchObject({ _tag: 'accepted', acceptedSeq: index + 3 })
  }

  expect(
    await stub.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetSeq: 5, targetCommandId: pots[2]!.commandId },
    }),
  ).toMatchObject({ _tag: 'accepted', acceptedSeq: 6 })
  const protocol = await stub.getProtocol()
  expect(protocol).toMatchObject({
    latestSeq: 6,
    protocolEntries: expect.arrayContaining([
      expect.objectContaining({ acceptedSeq: 5, entryIndex: 0, source: 'player' }),
      expect.objectContaining({ acceptedSeq: 5, entryIndex: 1, source: 'system' }),
      expect.objectContaining({
        acceptedSeq: 6,
        entryIndex: 0,
        source: 'player',
        entryType: 'command-corrected',
        body: { targetSeq: 5, targetCommandId: pots[2]!.commandId, targetEntryIndex: 0 },
      }),
      expect.objectContaining({
        acceptedSeq: 6,
        entryIndex: 1,
        source: 'system',
        entryType: 'command-corrected',
        body: { targetSeq: 5, targetCommandId: pots[2]!.commandId, targetEntryIndex: 1 },
      }),
    ]),
  })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.getProtocol()).toEqual(protocol)
  expect(
    await restored.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetSeq: 4, targetCommandId: pots[1]!.commandId },
    }),
  ).toMatchObject({ _tag: 'accepted', acceptedSeq: 7 })
  expect(await restored.getControls()).toMatchObject({ latestSeq: 7, game: { score: { A: 1, B: 0 } } })
})

test('rejects correction of commencement and a stale command without changing the sequence', async () => {
  const { stub } = await initializedRoom()
  await stub.submitCommand(prepareCommand())
  const commence = commenceCommand()
  await stub.submitCommand(commence)

  const excluded = {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'command.correct', targetSeq: 2, targetCommandId: commence.commandId },
  }

  expect(await stub.submitCommand(excluded)).toEqual({
    _tag: 'rejected',
    reason: { code: 'correction-not-available' },
  })

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
      command: { type: 'command.correct', targetSeq: 3, targetCommandId: earlier.commandId },
    }),
  ).toEqual({ _tag: 'rejected', reason: { code: 'correction-not-available' } })
  expect(await stub.getControls()).toMatchObject({ latestSeq: 4, game: { score: { A: 1, B: 1 } } })
})

test('archives the original command and correction after the match later ends', async () => {
  const { stub } = await initializedRoom()
  await stub.submitCommand(prepareCommand())
  await stub.submitCommand(commenceCommand())

  const pot = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
  }

  await stub.submitCommand(pot)
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'command.correct', targetSeq: 3, targetCommandId: pot.commandId },
  })
  expect(await stub.submitCommand(matchEndingCommand())).toMatchObject({ _tag: 'accepted', endsMatch: true })
  await runInDurableObject(stub, async (room) => {
    const transfer = await room.prepareArchive()
    expect(transfer.finalState).toMatchObject({
      status: 'finished',
      frames: [{ pointsBySeat: { A: 0, B: 0 } }],
    })
    expect(transfer.protocolEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          acceptedSeq: 3,
          causedByCommandId: pot.commandId,
          entryType: 'player-command',
        }),
        expect.objectContaining({
          acceptedSeq: 4,
          entryType: 'command-corrected',
          body: { targetSeq: 3, targetCommandId: pot.commandId, targetEntryIndex: 0 },
        }),
      ]),
    )
  })
})
