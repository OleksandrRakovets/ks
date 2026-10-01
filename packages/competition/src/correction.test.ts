import { expect, test } from 'bun:test'

import { type MatchCommand, newCommandId, newMatchId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { correctMatch, isCorrectableCommand } from './correction'
import type { MatchConfig } from './definitions'
import { createMatch, restoreMatchCheckpoint } from './match'
import { correctionReferenceOf, type ProtocolEntry } from './protocol'

const acceptedAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)

const config: MatchConfig = {
  matchId: newMatchId(),
  gameKey: 'strila-v2',
  targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 2 },
  firstBreakerSeat: 'A',
}

function execute(match: ReturnType<typeof createMatch>, command: MatchCommand) {
  const result = match.execute(command)

  if (result._tag !== 'accepted') throw new Error('Expected accepted command')

  return result
}

function correction(targetSeq: number, targetCommandId: ReturnType<typeof newCommandId>): MatchCommand {
  return {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'command.correct', targetSeq, targetCommandId },
  }
}

test('compensates every outcome of one game command in reverse order', () => {
  const match = createMatch(config)
  execute(match, {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.prepare' },
  })
  execute(match, {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })

  for (let count = 0; count < 2; count += 1)
    execute(match, {
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
    })

  const matchBeforeTarget = restoreMatchCheckpoint(match.exportCheckpoint())

  const targetCommand = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
  }

  const targetResult = execute(match, targetCommand)
  const targetSeq = 5

  const protocolEntries: ProtocolEntry[] = targetResult.protocolEntryContents.map((entry, entryIndex) => ({
    ...entry,
    acceptedSeq: targetSeq,
    entryIndex,
    causedByCommandId: targetCommand.commandId,
    acceptedAt,
  }))

  const command = correction(targetSeq, targetCommand.commandId)

  expect(
    correctMatch(
      matchBeforeTarget,
      { acceptedSeq: targetSeq, command: targetCommand, protocolEntries },
      command,
    ),
  ).toMatchObject({
    _tag: 'accepted',
    command,
    protocolEntryContents: [
      {
        entryType: 'command-corrected',
        source: 'system',
        scoreAfter: { A: 2, B: 0 },
        body: { targetSeq, targetCommandId: targetCommand.commandId, targetEntryIndex: 1 },
      },
      {
        entryType: 'command-corrected',
        source: 'player',
        seat: 'A',
        scoreAfter: { A: 2, B: 0 },
        body: { targetSeq, targetCommandId: targetCommand.commandId, targetEntryIndex: 0 },
      },
    ],
  })
  expect(matchBeforeTarget.controlProjection().game).toMatchObject({
    score: { A: 2, B: 0 },
    details: { phase: 'open-play' },
  })
})

test('rejects a stale target and lifecycle commands, and reports malformed correction input', () => {
  const match = createMatch(config)

  const targetCommand = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
  }

  const target = { acceptedSeq: 3, command: targetCommand, protocolEntries: [] }

  expect(correctMatch(match, target, correction(4, targetCommand.commandId))).toEqual({
    _tag: 'rejected',
    reason: { code: 'correction-not-available' },
  })
  expect(
    isCorrectableCommand({
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'frame.award', seat: 'A' },
    }),
  ).toBe(false)
  expect(
    correctMatch(match, target, {
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'command.correct', targetCommandId: targetCommand.commandId },
    }),
  ).toMatchObject({ _tag: 'parse-failed' })
})

test('reads zero-based correction references', () => {
  const commandId = newCommandId()

  const entry: ProtocolEntry = {
    acceptedSeq: 3,
    entryIndex: 0,
    causedByCommandId: commandId,
    acceptedAt,
    frameIndex: 1,
    gameKey: 'strila-v2',
    source: 'player',
    entryType: 'player-command',
    seat: 'A',
    body: { commandType: 'pot.record', pottedBalls: [1] },
  }

  expect(
    correctionReferenceOf({
      ...entry,
      acceptedSeq: 4,
      causedByCommandId: newCommandId(),
      entryType: 'command-corrected',
      body: { targetSeq: 3, targetCommandId: commandId, targetEntryIndex: 0 },
    }),
  ).toEqual({ targetSeq: 3, targetCommandId: commandId, targetEntryIndex: 0 })
})
