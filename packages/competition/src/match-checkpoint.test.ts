import { expect, test } from 'bun:test'

import { type MatchCommand, type MatchConfig, newCommandId, newMatchId } from '@ks/core'
import * as v from 'valibot'

import { MatchCheckpoint } from './contracts'
import { createMatch, type Match, restoreMatchCheckpoint } from './match'

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
  expect(restored.project()).toEqual(match.project())
  expect(restored.gameResult()).toEqual(match.gameResult())
  expect(restored.exportCheckpoint()).toEqual(checkpoint)

  return restored
}

test('initial, prepared, between-frames and finished states retain execution and lifecycle Protocol', () => {
  const match = createMatch(config('free-pyramid', 2))
  const initial = roundTrip(match)
  const prepare = { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } } as const
  expect(initial.execute(prepare)).toEqual(match.execute(prepare))
  const prepared = roundTrip(match)

  const concede = {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.concede', seat: 'A' },
  } as const

  expect(prepared.execute(concede)).toEqual(match.execute(concede))
  const between = roundTrip(match)
  expect(between.execute(prepare)).toEqual(match.execute(prepare))
  const next = roundTrip(match)
  expect(next.execute(concede)).toEqual(match.execute(concede))
  const finished = roundTrip(match)
  expect(finished.project().state.framesWonBySeat).toEqual({ A: 0, B: 2 })
  expect(finished.execute(prepare)).toEqual(match.execute(prepare))
})

test('Strila nested foul phase preserves offender and subsequent Protocol', () => {
  const match = createMatch(config('strila-v2'))
  send(match, 'match', { type: 'frame.prepare' })
  send(match, 'match', { type: 'frame.commence', seat: 'B' })
  send(match, 'game', { type: 'foul.commit', seat: 'B' })
  const checkpoint = match.exportCheckpoint()
  expect(checkpoint.gameplay?.state.value).toEqual({ 'foul-committed': 'penalty-selection' })
  const restored = roundTrip(match)

  const command = {
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'penalty.select', seat: 'A', choice: 'ball-in-hand' },
  } as const

  expect(restored.execute(command)).toEqual(match.execute(command))
  expect(restored.project()).toEqual(match.project())
})

test('pyramid rule-specific negative score survives restore for old combined rules', () => {
  const match = createMatch(config('combined-pyramid-old'))
  send(match, 'match', { type: 'frame.prepare' })
  send(match, 'match', { type: 'frame.commence', seat: 'B' })
  send(match, 'game', { type: 'foul.commit', seat: 'B' })
  const restored = roundTrip(match)
  expect(restored.project().state.frames[0]?.pointsBySeat).toEqual({ A: 0, B: -1 })

  const command = {
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 2 },
  } as const

  expect(restored.execute(command)).toEqual(match.execute(command))
})

test('restored winner-determined gameplay produces the final outcome and complete Protocol on award', () => {
  const match = createMatch({
    ...config('free-pyramid', 1),
    targets: { frameTargetPointsBySeat: { A: 3, B: 5 }, matchTargetFrames: 1 },
  })

  send(match, 'match', { type: 'frame.prepare' })
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
  expect(restored.project()).toEqual(match.project())
  expect(restored.project().state).toMatchObject({
    status: 'finished',
    currentFrameIndex: 1,
    framesWonBySeat: { A: 1, B: 0 },
    frames: [{ frameIndex: 1, breakerSeat: 'B', winnerSeat: 'A', pointsBySeat: { A: 3, B: 1 } }],
  })
  expect(roundTrip(restored).project()).toEqual(restored.project())
})

test('long pyramid awaiting-award restores a foul-determined winner and retained rack result', () => {
  const match = createMatch({
    ...config('free-pyramid-long', 1),
    targets: { frameTargetPointsBySeat: { A: 4, B: 2 }, matchTargetFrames: 1 },
  })

  send(match, 'match', { type: 'frame.prepare' })
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
  expect(restored.project().state).toMatchObject({ status: 'finished', framesWonBySeat: { A: 0, B: 1 } })
  expect(roundTrip(restored).gameResult()).toEqual({
    gameKey: 'free-pyramid-long',
    racks: [{ rackNumber: 1, scoreBySeat: { A: 0, B: 2 } }],
  })
})

test('long pyramid rack rollover and retained result after completed frame', () => {
  const match = createMatch(config('free-pyramid-long', 1))
  send(match, 'match', { type: 'frame.prepare' })
  send(match, 'match', { type: 'frame.commence', seat: 'B' })

  for (const count of [4, 4, 4, 2])
    send(match, 'game', { type: 'pot.record', seat: 'B', pottedBallCount: count })
  const restored = roundTrip(match)
  expect(restored.gameResult()).toMatchObject({ racks: [{ rackNumber: 1 }, { rackNumber: 2 }] })

  const command = {
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  } as const

  expect(restored.execute(command)).toEqual(match.execute(command))
  send(restored, 'match', { type: 'frame.concede', seat: 'A' })
  expect(roundTrip(restored).gameResult()).toEqual(restored.gameResult())
})

test('retained long result coexists with the next active frame', () => {
  const match = createMatch(config('free-pyramid-long'))
  send(match, 'match', { type: 'frame.prepare' })
  send(match, 'match', { type: 'frame.concede', seat: 'A' })
  const completed = roundTrip(match).gameResult()
  send(match, 'match', { type: 'frame.prepare' })
  expect(match.exportCheckpoint().completedGameResult).toEqual(completed)
  const restored = roundTrip(match)

  const commence = {
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  } as const

  expect(restored.execute(commence)).toEqual(match.execute(commence))
})

test.each(['free-pyramid', 'combined-pyramid'] as const)('%s restores an active scoring frame', (gameKey) => {
  const match = createMatch(config(gameKey))
  send(match, 'match', { type: 'frame.prepare' })
  send(match, 'match', { type: 'frame.commence', seat: 'B' })
  send(match, 'game', { type: 'pot.record', seat: 'A', pottedBallCount: 1 })
  const restored = roundTrip(match)

  const command = {
    commandId: newCommandId(),
    source: 'game',
    command: { type: 'foul.commit', seat: 'B' },
  } as const

  expect(restored.execute(command)).toEqual(match.execute(command))
})

test('rejects inconsistent persisted aggregates and corrupted hidden rule context', () => {
  const match = createMatch(config('combined-pyramid'))
  send(match, 'match', { type: 'frame.prepare' })
  // SAFETY: JSON parsing yields an untrusted value that the checkpoint schema validates.
  const checkpoint = v.parse(MatchCheckpoint, JSON.parse(JSON.stringify(match.exportCheckpoint())) as unknown)

  const gameplay = checkpoint.gameplay

  if (gameplay?.gameKey !== 'combined-pyramid') throw new Error('Expected combined gameplay')
  expect(() => restoreMatchCheckpoint({ ...checkpoint, gameplay: null })).toThrow()
  expect(() =>
    restoreMatchCheckpoint({
      ...checkpoint,
      lifecycle: { ...checkpoint.lifecycle, context: { ...checkpoint.lifecycle.context, nextFrameIndex: 3 } },
    }),
  ).toThrow()
  expect(() =>
    restoreMatchCheckpoint({
      ...checkpoint,
      gameplay: {
        ...gameplay,
        state: {
          ...gameplay.state,
          context: {
            ...gameplay.state.context,
            rules: { ...gameplay.state.context.rules, allowNegative: true },
          },
        },
      },
    }),
  ).toThrow()

  expect(() =>
    v.parse(MatchCheckpoint, {
      ...checkpoint,
      gameplay: { ...gameplay, state: { ...gameplay.state, value: 'unknown-phase' } },
    }),
  ).toThrow()
})

test('rejects an unsupported game key even without active gameplay', () => {
  const checkpoint = createMatch(config('free-pyramid')).exportCheckpoint()
  expect(() =>
    restoreMatchCheckpoint({
      ...checkpoint,
      lifecycle: {
        ...checkpoint.lifecycle,
        context: {
          ...checkpoint.lifecycle.context,
          config: { ...checkpoint.lifecycle.context.config, gameKey: 'unregistered-game' },
        },
      },
    }),
  ).toThrow()
})
