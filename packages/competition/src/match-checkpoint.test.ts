import { expect, test } from 'bun:test'

import { type MatchCommand, newCommandId, newMatchId } from '@ks/core'
import * as v from 'valibot'

import type { MatchConfig } from './definitions'
import { createMatch, type Match, MatchCheckpoint, restoreMatchCheckpoint } from './match'

function config(gameKey: MatchConfig['gameKey'], matchTargetFrames = 2): MatchConfig {
  const base: MatchConfig = {
    matchId: newMatchId(),
    gameKey,
    firstBreakerSeat: 'B',
    targets: { frameTargetPointsBySeat: { A: 20, B: 21 }, matchTargetFrames },
  }

  return gameKey === 'free-pyramid-long' ? { ...base, gameConfiguration: { rackRollover: 14 } } : base
}

function send(match: Match, source: MatchCommand['source'], command: MatchCommand['command']) {
  const result = match.execute({ commandId: newCommandId(), source, command })
  expect(result._tag).toBe('accepted')

  return result
}

function roundTrip(match: Match): Match {
  // SAFETY: JSON parsing yields an untrusted value that the checkpoint schema validates.
  const checkpoint = v.parse(MatchCheckpoint, JSON.parse(JSON.stringify(match.exportCheckpoint())) as unknown)
  const restored = restoreMatchCheckpoint(checkpoint)
  expect(restored.phase()).toBe(match.phase())
  expect(restored.state()).toEqual(match.state())
  expect(restored.controlProjection()).toEqual(match.controlProjection())
  expect(restored.gameResult()).toEqual(match.gameResult())
  expect(restored.exportCheckpoint()).toEqual(checkpoint)

  return restored
}

test('stable initial, next-frame and finished checkpoints retain execution and lifecycle Protocol', () => {
  const match = createMatch(config('free-pyramid', 2))
  const initial = roundTrip(match)

  const commence = {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'B' },
  } as const

  expect(initial.execute(commence)).toEqual(match.execute(commence))
  const prepared = roundTrip(match)

  const concede = {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.concede', seat: 'A' },
  } as const

  expect(prepared.execute(concede)).toEqual(match.execute(concede))
  const next = roundTrip(match)
  expect(next.phase()).toBe('frame-in-progress')
  expect(next.state()).toMatchObject({
    currentFrameIndex: 2,
    frames: [{ winnerSeat: 'B' }, { breakerSeat: 'A', pointsBySeat: { A: 0, B: 0 } }],
  })
  send(next, 'match', { type: 'frame.commence', seat: 'A' })
  send(match, 'match', { type: 'frame.commence', seat: 'A' })
  expect(next.execute(concede)).toEqual(match.execute(concede))
  const finished = roundTrip(match)
  expect(finished.state().framesWonBySeat).toEqual({ A: 0, B: 2 })
  expect(finished.state().frames).toHaveLength(2)
  expect(finished.exportCheckpoint().gameplay).toBeNull()
  expect(finished.execute(commence)).toEqual(match.execute(commence))
})

test('restored winner-determined gameplay produces the final outcome and complete Protocol on award', () => {
  const match = createMatch({
    ...config('free-pyramid', 1),
    targets: { frameTargetPointsBySeat: { A: 3, B: 5 }, matchTargetFrames: 1 },
  })

  send(match, 'match', { type: 'frame.commence', seat: 'B' })
  send(match, 'game', { type: 'pot.record', seat: 'B', pottedBallCount: 1 })
  send(match, 'game', { type: 'pot.record', seat: 'A', pottedBallCount: 2 })
  send(match, 'game', { type: 'pot.record', seat: 'A', pottedBallCount: 1 })
  expect(match.exportCheckpoint().gameplay?.state.value).toBe('winner-determined')

  const restored = roundTrip(match)

  const command = {
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'frame.award', seat: 'A' },
  } as const

  const expected = {
    _tag: 'accepted',
    command,
    protocolEntryContents: [
      {
        gameKey: 'free-pyramid',
        frameIndex: 1,
        source: 'player',
        entryType: 'player-command',
        seat: 'A',
        body: { commandType: 'frame.award' },
      },
      {
        gameKey: 'free-pyramid',
        frameIndex: 1,
        source: 'system',
        entryType: 'frame-awarded',
        seat: 'A',
        scoreAfter: { A: 3, B: 1 },
        body: { winReason: 'game-rules' },
      },
      {
        gameKey: 'free-pyramid',
        frameIndex: 1,
        source: 'system',
        entryType: 'match-ended',
        seat: 'A',
        body: {},
      },
    ],
  } as const

  expect(restored.execute(command)).toEqual(expected)
  expect(match.execute(command)).toEqual(expected)
  expect(restored.state()).toEqual(match.state())
  expect(restored.controlProjection()).toEqual(match.controlProjection())
  expect(restored.state()).toMatchObject({
    status: 'finished',
    currentFrameIndex: 1,
    framesWonBySeat: { A: 1, B: 0 },
    frames: [{ frameIndex: 1, breakerSeat: 'B', winnerSeat: 'A', pointsBySeat: { A: 3, B: 1 } }],
  })
  expect(roundTrip(restored).state()).toEqual(restored.state())
})

test('long pyramid awaiting-award restores a foul-determined winner and retained rack result', () => {
  const match = createMatch({
    ...config('free-pyramid-long', 1),
    targets: { frameTargetPointsBySeat: { A: 4, B: 2 }, matchTargetFrames: 1 },
  })

  send(match, 'match', { type: 'frame.commence', seat: 'B' })
  send(match, 'game', { type: 'foul.commit', seat: 'A' })
  send(match, 'game', { type: 'foul.commit', seat: 'A' })
  expect(match.exportCheckpoint().gameplay?.state.value).toBe('awaiting-award')

  const restored = roundTrip(match)

  const command = {
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'frame.award', seat: 'B' },
  } as const

  const result = restored.execute(command)

  expect(result).toEqual(match.execute(command))
  expect(result).toMatchObject({
    _tag: 'accepted',
    protocolEntryContents: [
      { entryType: 'player-command', body: { commandType: 'frame.award' } },
      { entryType: 'frame-awarded', seat: 'B', scoreAfter: { A: 0, B: 2 }, body: { winReason: 'game-rules' } },
      { entryType: 'match-ended', seat: 'B' },
    ],
  })
  expect(restored.state()).toMatchObject({ status: 'finished', framesWonBySeat: { A: 0, B: 1 } })
  expect(roundTrip(restored).gameResult()).toEqual({
    gameKey: 'free-pyramid-long',
    racks: [{ rackNumber: 1, scoreBySeat: { A: 0, B: 2 } }],
  })
})

test('retained long result coexists with the next active frame', () => {
  const match = createMatch(config('free-pyramid-long'))
  send(match, 'match', { type: 'frame.commence', seat: 'B' })
  send(match, 'game', { type: 'pot.record', seat: 'B', pottedBallCount: 2 })
  send(match, 'match', { type: 'frame.concede', seat: 'A' })
  const completed = match.exportCheckpoint().completedGameResult
  expect(completed).toEqual({
    gameKey: 'free-pyramid-long',
    racks: [{ rackNumber: 1, scoreBySeat: { A: 0, B: 2 } }],
  })
  expect(match.state().frames).toEqual([
    { frameIndex: 1, breakerSeat: 'B', winnerSeat: 'B', pointsBySeat: { A: 0, B: 2 } },
    { frameIndex: 2, breakerSeat: 'A', pointsBySeat: { A: 0, B: 0 } },
  ])
  expect(match.gameResult()).toEqual({
    gameKey: 'free-pyramid-long',
    racks: [{ rackNumber: 1, scoreBySeat: { A: 0, B: 0 } }],
  })
  const restored = roundTrip(match)

  const commence = {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  } as const

  expect(restored.execute(commence)).toEqual(match.execute(commence))
})

test('rejects inconsistent persisted aggregates and unknown checkpoint fields', () => {
  const match = createMatch(config('combined-pyramid'))
  // SAFETY: JSON parsing yields an untrusted value that the checkpoint schema validates.
  const checkpoint = v.parse(MatchCheckpoint, JSON.parse(JSON.stringify(match.exportCheckpoint())) as unknown)

  const gameplay = checkpoint.gameplay

  if (gameplay?.gameKey !== 'combined-pyramid') throw new Error('Expected combined gameplay')
  expect(() =>
    restoreMatchCheckpoint({
      ...checkpoint,
      lifecycle: {
        ...checkpoint.lifecycle,
        value: 'between-frames',
        context: { ...checkpoint.lifecycle.context, activeFrame: null },
      },
      gameplay: null,
    }),
  ).toThrow('Cannot restore a transient match phase')
  expect(() => restoreMatchCheckpoint({ ...checkpoint, gameplay: null })).toThrow(
    'Inconsistent match checkpoint',
  )
  expect(() =>
    restoreMatchCheckpoint({
      ...checkpoint,
      lifecycle: { ...checkpoint.lifecycle, context: { ...checkpoint.lifecycle.context, nextFrameIndex: 3 } },
    }),
  ).toThrow('Inconsistent match lifecycle checkpoint')

  for (const unknownField of [
    {
      ...checkpoint,
      lifecycle: { ...checkpoint.lifecycle, context: { ...checkpoint.lifecycle.context, futureField: 1 } },
    },
    {
      ...checkpoint,
      gameplay: {
        ...gameplay,
        state: { ...gameplay.state, context: { ...gameplay.state.context, futureField: 1 } },
      },
    },
  ])
    expect(() => v.parse(MatchCheckpoint, unknownField)).toThrow('futureField')
})

test('rejects an unsupported game key even without active gameplay', () => {
  const match = createMatch(config('free-pyramid', 1))
  send(match, 'match', { type: 'frame.commence', seat: 'B' })
  send(match, 'match', { type: 'frame.concede', seat: 'A' })
  const checkpoint = match.exportCheckpoint()
  expect(checkpoint.gameplay).toBeNull()
  expect(() =>
    v.parse(MatchCheckpoint, {
      ...checkpoint,
      lifecycle: {
        ...checkpoint.lifecycle,
        context: {
          ...checkpoint.lifecycle.context,
          config: { ...checkpoint.lifecycle.context.config, gameKey: 'unregistered-game' },
        },
      },
    }),
  ).toThrow('unregistered-game')
})
