import { describe, expect, test } from 'bun:test'

import { ProtocolEntrySchema } from '@ks/core'
import * as v from 'valibot'

import type { GameCommandExecution } from './gameplay-session'
import { listGameKeys } from './registry'
import { createGameplaySession } from './session-factory'

function expectAccepted(result: GameCommandExecution): Extract<GameCommandExecution, { _tag: 'accepted' }> {
  expect(result._tag).toBe('accepted')
  if (result._tag !== 'accepted') throw new Error('Expected accepted gameplay command')
  expect(result.protocolEntries.length).toBeGreaterThan(0)
  expect(result.protocolEntries.every((entry) => v.is(ProtocolEntrySchema, entry))).toBe(true)
  return result
}

describe('gameplay characterization', () => {
  test('covers every registered game', () => {
    expect(listGameKeys().sort()).toEqual([
      'combined-pyramid',
      'combined-pyramid-old',
      'free-pyramid',
      'free-pyramid-long',
      'strila-v2',
    ])
  })

  test('every accepted pyramid-family command produces protocol entries', () => {
    for (const gameKey of ['free-pyramid', 'combined-pyramid', 'combined-pyramid-old'] as const) {
      const session = createGameplaySession(gameKey, { targetPointsBySeat: { A: 2, B: 8 } })
      expectAccepted(session.execute({ type: 'frame.commence', seat: 'A' }))
      expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 1 }))
      expectAccepted(session.execute({ type: 'foul.commit', seat: 'B' }))
      expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 1 }))
      expectAccepted(session.execute({ type: 'frame.award', seat: 'A' }))
    }
  })

  test('every accepted long free pyramid command produces protocol entries', () => {
    const session = createGameplaySession('free-pyramid-long', { targetPointsBySeat: { A: 2, B: 30 }, rackRollover: 14 })
    expectAccepted(session.execute({ type: 'frame.commence', seat: 'A' }))
    expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 1 }))
    expectAccepted(session.execute({ type: 'foul.commit', seat: 'A' }))
    expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 1 }))
    expectAccepted(session.execute({ type: 'frame.award', seat: 'A' }))
  })

  test('every accepted strila command produces protocol entries', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: { A: 9, B: 9 } })
    expectAccepted(session.execute({ type: 'frame.commence', seat: 'A' }))
    expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBalls: [1] }))
    expectAccepted(session.execute({ type: 'foul.commit', seat: 'A' }))
    expectAccepted(session.execute({ type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' }))
    expectAccepted(session.execute({ type: 'miss.record', seat: 'B' }))
    expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBalls: [2] }))
    expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBalls: [3] }))
    expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBalls: [4] }))
    expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBalls: [5] }))
    expectAccepted(session.execute({ type: 'frame.award', seat: 'A' }))
  })

  test('one strila command can produce ordered player and system protocol entries', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: { A: 1, B: 9 } })
    expectAccepted(session.execute({ type: 'frame.commence', seat: 'A' }))
    const result = expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBalls: [0] }))
    expect(result.protocolEntries.map((entry) => ({ source: entry.source, body: entry.body }))).toEqual([
      { source: 'player', body: { commandType: 'pot.record', pottedBalls: [0] } },
      { source: 'system', body: { systemType: 'winner-determined', reason: 'target-reached' } },
    ])
  })

  test('pyramid foul penalty direction remains game-specific', () => {
    const opponentPlus = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 } })
    expectAccepted(opponentPlus.execute({ type: 'frame.commence', seat: 'A' }))
    const freeFoul = expectAccepted(opponentPlus.execute({ type: 'foul.commit', seat: 'A' }))
    expect(opponentPlus.getScore()).toEqual({ A: 0, B: 1 })
    expect(freeFoul.protocolEntries[0]?.body).toEqual({ commandType: 'foul.commit', penalty: 'opponent-plus-one' })

    const combined = createGameplaySession('combined-pyramid', { targetPointsBySeat: { A: 8, B: 8 } })
    expectAccepted(combined.execute({ type: 'frame.commence', seat: 'A' }))
    expectAccepted(combined.execute({ type: 'foul.commit', seat: 'A' }))
    expect(combined.getScore()).toEqual({ A: 0, B: 1 })

    const owed = createGameplaySession('combined-pyramid-old', { targetPointsBySeat: { A: 8, B: 8 } })
    expectAccepted(owed.execute({ type: 'frame.commence', seat: 'A' }))
    const oldFoul = expectAccepted(owed.execute({ type: 'foul.commit', seat: 'A' }))
    expect(owed.getScore()).toEqual({ A: -1, B: 0 })
    expect(oldFoul.protocolEntries[0]?.body).toEqual({ commandType: 'foul.commit', penalty: 'offender-minus-one' })
  })

  test('winner-determined players may continue legal scoring until award', () => {
    const pyramid = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 1, B: 8 } })
    expectAccepted(pyramid.execute({ type: 'frame.commence', seat: 'A' }))
    expectAccepted(pyramid.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 1 }))
    expect(pyramid.deriveControl().details.phase).toBe('winner-determined')
    expectAccepted(pyramid.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 1 }))
    expect(pyramid.getScore()).toEqual({ A: 2, B: 0 })
    const awarded = expectAccepted(pyramid.execute({ type: 'frame.award', seat: 'A' }))
    expect(awarded.outcome).toEqual({ winnerSeat: 'A', winReason: 'target-reached', score: { A: 2, B: 0 } })

    const long = createGameplaySession('free-pyramid-long', { targetPointsBySeat: { A: 1, B: 30 }, rackRollover: 14 })
    expectAccepted(long.execute({ type: 'frame.commence', seat: 'A' }))
    expectAccepted(long.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 1 }))
    expect(long.deriveControl().details.phase).toBe('winner-determined')
    expectAccepted(long.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 1 }))
    expect(long.getScore()).toEqual({ A: 2, B: 0 })

    const strila = createGameplaySession('strila-v2', { targetPointsBySeat: { A: 1, B: 9 } })
    expectAccepted(strila.execute({ type: 'frame.commence', seat: 'A' }))
    expectAccepted(strila.execute({ type: 'pot.record', seat: 'A', pottedBalls: [1] }))
    expect(strila.deriveControl().details.phase).toBe('winner-determined')
    expectAccepted(strila.execute({ type: 'pot.record', seat: 'A', pottedBalls: [2] }))
    expect(strila.getScore()).toEqual({ A: 4, B: 0 })
  })

  test('long free pyramid table counts and rack rollover remain correct', () => {
    const session = createGameplaySession('free-pyramid-long', { targetPointsBySeat: { A: 30, B: 30 }, rackRollover: 14 })
    expectAccepted(session.execute({ type: 'frame.commence', seat: 'A' }))
    for (const pottedBallCount of [4, 4, 4, 2] as const) {
      expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBallCount }))
    }

    const control = session.deriveControl()
    expect(session.getScore()).toEqual({ A: 14, B: 0 })
    expect(control.details.ballsOnTable).toBe(16)
    expect(control.details.rackHistory).toEqual([
      { rackNumber: 1, scoreBySeat: { A: 14, B: 0 } },
      { rackNumber: 2, scoreBySeat: { A: 0, B: 0 } },
    ])
    expect(control.details.messages).toEqual([{ code: 'rack-started', rackNumber: 2 }])
  })

  test('rejected commands retain state and produce no protocol entries', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 } })
    expectAccepted(session.execute({ type: 'frame.commence', seat: 'A' }))
    const score = session.getScore()
    const control = session.deriveControl()
    expect(session.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 3 })).toEqual({
      _tag: 'rejected',
      reason: { code: 'command-not-available' },
    })
    expect(session.getScore()).toEqual(score)
    expect(session.deriveControl()).toEqual(control)
  })
})
