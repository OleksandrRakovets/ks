import { expect, test } from 'bun:test'

import {
  type AcceptedCommand,
  type MatchCommand,
  type MatchConfig,
  newCommandId,
  newMatchId,
  UnixEpochMilliseconds,
} from '@ks/core'
import * as v from 'valibot'

import { correctMatch, createMatch, isCorrectableCommand, restoreMatch } from './match'

const acceptedAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)

function config(gameKey: MatchConfig['gameKey'] = 'strila-v2'): MatchConfig {
  const base: MatchConfig = {
    matchId: newMatchId(),
    gameKey,
    targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 2 },
    firstBreakerSeat: 'A',
  }

  return gameKey === 'free-pyramid-long' ? { ...base, gameConfiguration: { rackRollover: 14 } } : base
}

function record(
  match: ReturnType<typeof createMatch>,
  history: AcceptedCommand[],
  source: MatchCommand['source'],
  command: MatchCommand['command'],
) {
  const submitted = { commandId: newCommandId(), source, command }
  const result = match.execute(submitted)
  expect(result._tag).toBe('accepted')
  const accepted = { ...submitted, acceptedSeq: history.length + 1, acceptedAt }
  history.push(accepted)

  return accepted
}

function open(config: MatchConfig) {
  const match = createMatch(config)
  const history: AcceptedCommand[] = []
  record(match, history, 'match', { type: 'frame.prepare' })
  record(match, history, 'match', { type: 'frame.commence', seat: 'A' })

  return { match, history }
}

function correction(target: AcceptedCommand): MatchCommand {
  return {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'command.correct', targetSeq: target.acceptedSeq, targetCommandId: target.commandId },
  }
}

test('compensates the third cue-ball pot and its automatic foul while retaining both original entries', () => {
  const setup = config()
  const { match, history } = open(setup)
  record(match, history, 'game', { type: 'pot.record', seat: 'A', pottedBalls: [0] })
  record(match, history, 'game', { type: 'pot.record', seat: 'A', pottedBalls: [0] })
  const target = record(match, history, 'game', { type: 'pot.record', seat: 'A', pottedBalls: [0] })
  const submitted = correction(target)
  const corrected = correctMatch(setup, history, submitted)
  expect(corrected.result).toMatchObject({
    _tag: 'accepted',
    protocolEntryContents: [
      {
        entryType: 'command-corrected',
        source: 'system',
        scoreAfter: { A: 2, B: 0 },
        body: { targetSeq: target.acceptedSeq, targetCommandId: target.commandId, targetEntryIndex: 1 },
      },
      {
        entryType: 'command-corrected',
        source: 'player',
        seat: 'A',
        scoreAfter: { A: 2, B: 0 },
        body: { targetSeq: target.acceptedSeq, targetCommandId: target.commandId, targetEntryIndex: 0 },
      },
    ],
  })
  expect(corrected.match?.project().game).toMatchObject({
    score: { A: 2, B: 0 },
    details: { phase: 'open-play' },
  })
  history.push({ ...submitted, acceptedSeq: 6, acceptedAt })
  const restored = restoreMatch(setup, history)
  expect(corrected.match).toBeDefined()
  expect(restored.match.project()).toEqual(corrected.match!.project())
  expect(restored.accepted[4]?.protocolEntryContents.map((entry) => entry.body)).toEqual([
    { commandType: 'pot.record', pottedBalls: [0] },
    { systemType: 'automatic-foul', reason: 'third-consecutive-cue-ball-pot' },
  ])
  expect(restored.accepted[5]?.protocolEntryContents).toMatchObject([
    { source: 'system', body: { targetSeq: 5, targetEntryIndex: 1 } },
    { source: 'player', body: { targetSeq: 5, targetEntryIndex: 0 } },
  ])

  const next = {
    commandId: newCommandId(),
    source: 'game' as const,
    command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
  }

  expect(restored.match.execute(next)).toMatchObject({
    _tag: 'accepted',
    protocolEntryContents: [
      { body: { commandType: 'pot.record' } },
      { body: { systemType: 'automatic-foul' } },
    ],
  })
})

test('correcting a target-reaching shot restores scoring and the available controls', () => {
  const setup = {
    ...config('free-pyramid'),
    targets: { frameTargetPointsBySeat: { A: 2, B: 5 }, matchTargetFrames: 2 },
  }

  const { match, history } = open(setup)
  record(match, history, 'game', { type: 'pot.record', seat: 'B', pottedBallCount: 1 })
  const target = record(match, history, 'game', { type: 'pot.record', seat: 'A', pottedBallCount: 2 })
  expect(match.project().game?.details.phase).toBe('winner-determined')
  const corrected = correctMatch(setup, history, correction(target))
  expect(corrected.match?.project().game).toMatchObject({
    score: { A: 0, B: 1 },
    details: { phase: 'open-play' },
  })
  expect(corrected.result).toMatchObject({
    _tag: 'accepted',
    protocolEntryContents: [{ source: 'player', body: { targetEntryIndex: 0 } }],
  })
  expect(
    corrected.match
      ?.project()
      .controls.some((control) => control.type === 'pot.record' && control.seat === 'B'),
  ).toBe(true)
})

test('correcting long-pyramid rack rollover restores the prior rack and total', () => {
  const setup = {
    ...config('free-pyramid-long'),
    targets: { frameTargetPointsBySeat: { A: 30, B: 30 }, matchTargetFrames: 1 },
  }

  const { match, history } = open(setup)

  for (let count = 0; count < 13; count += 1)
    record(match, history, 'game', { type: 'pot.record', seat: 'A', pottedBallCount: 1 })
  const target = record(match, history, 'game', { type: 'pot.record', seat: 'B', pottedBallCount: 1 })
  const game = match.project().game
  expect(game?.gameKey).toBe('free-pyramid-long')

  if (game?.gameKey !== 'free-pyramid-long') throw new Error('Expected long pyramid')
  expect(game.details.currentRack.rackNumber).toBe(2)
  const corrected = correctMatch(setup, history, correction(target))
  expect(corrected.match?.project().game).toMatchObject({
    score: { A: 13, B: 0 },
    details: { currentRack: { rackNumber: 1, scoreBySeat: { A: 13, B: 0 } } },
  })
})

test('corrects three consecutive scores in reverse order across restoration', () => {
  const setup = config('free-pyramid')
  const { match, history } = open(setup)

  const pots = Array.from({ length: 3 }, () =>
    record(match, history, 'game', { type: 'pot.record', seat: 'A', pottedBallCount: 1 }),
  )

  for (const [index, target] of [...pots].reverse().entries()) {
    const submitted = correction(target)
    const corrected = correctMatch(setup, history, submitted)
    expect(corrected.result._tag).toBe('accepted')
    expect(corrected.match?.project().game).toMatchObject({ score: { A: 2 - index, B: 0 } })
    history.push({ ...submitted, acceptedSeq: history.length + 1, acceptedAt })

    if (!corrected.match) throw new Error('Expected correction to restore a match')
    expect(restoreMatch(setup, history).match.project()).toEqual(corrected.match.project())
    expect(correctMatch(setup, history, correction(target)).result).toMatchObject({
      _tag: 'rejected',
      reason: { code: 'correction-not-available' },
    })
  }

  expect(correctMatch(setup, history, correction(pots[0]!)).result._tag).toBe('rejected')
})

test('rejects stale targets, a second correction, and non-game lifecycle actions', () => {
  const setup = config()
  const { match, history } = open(setup)
  expect(isCorrectableCommand(history[1]!)).toBe(false)
  const first = record(match, history, 'game', { type: 'miss.record', seat: 'A' })
  const second = record(match, history, 'game', { type: 'foul.commit', seat: 'B' })
  expect(correctMatch(setup, history, correction(first)).result).toMatchObject({
    _tag: 'rejected',
    reason: { code: 'correction-not-available' },
  })
  const submitted = correction(second)
  expect(correctMatch(setup, history, submitted).result._tag).toBe('accepted')
  history.push({ ...submitted, acceptedSeq: 5, acceptedAt })
  expect(correctMatch(setup, history, correction(second)).result).toMatchObject({
    _tag: 'rejected',
    reason: { code: 'correction-not-available' },
  })
  expect(correctMatch(setup, history, correction(first)).result._tag).toBe('accepted')
  expect(() =>
    restoreMatch(setup, [...history, { ...correction(second), acceptedSeq: 6, acceptedAt }]),
  ).toThrow()
})
