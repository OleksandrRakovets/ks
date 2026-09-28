import { expect, test } from 'bun:test'

import {
  type MatchCommand,
  type MatchConfig,
  newCommandId,
  newMatchId,
  type ProtocolEntry,
  UnixEpochMilliseconds,
} from '@ks/core'
import * as v from 'valibot'

import { correctMatch, createMatch, isCorrectableCommand, restoreMatchCheckpoint } from './match'

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
  expect(matchBeforeTarget.gamePresentation()).toMatchObject({
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
