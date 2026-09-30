import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { type GameCommandExecution, GameProtocolEntry } from './gameplay-session'
import { createGameplaySession } from './session-factory'

function expectAccepted(result: GameCommandExecution): Extract<GameCommandExecution, { _tag: 'accepted' }> {
  expect(result._tag).toBe('accepted')

  if (result._tag !== 'accepted') throw new Error('Expected accepted gameplay command')
  expect(result.gameProtocolEntries.length).toBeGreaterThan(0)
  expect(result.gameProtocolEntries.every((entry) => v.is(GameProtocolEntry, entry))).toBe(true)

  return result
}

describe('gameplay characterization', () => {
  test('pyramid foul penalty direction remains game-specific', () => {
    const opponentPlus = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 } })
    expectAccepted(opponentPlus.execute({ type: 'frame.commence', seat: 'A' }))
    const freeFoul = expectAccepted(opponentPlus.execute({ type: 'foul.commit', seat: 'A' }))
    expect(opponentPlus.getScore()).toEqual({ A: 0, B: 1 })
    expect(freeFoul.gameProtocolEntries[0].body).toEqual({
      commandType: 'foul.commit',
      penalty: 'opponent-plus-one',
    })

    const combined = createGameplaySession('combined-pyramid', { targetPointsBySeat: { A: 8, B: 8 } })
    expectAccepted(combined.execute({ type: 'frame.commence', seat: 'A' }))
    expectAccepted(combined.execute({ type: 'foul.commit', seat: 'A' }))
    expect(combined.getScore()).toEqual({ A: 0, B: 1 })

    const owed = createGameplaySession('combined-pyramid-old', { targetPointsBySeat: { A: 8, B: 8 } })
    expectAccepted(owed.execute({ type: 'frame.commence', seat: 'A' }))
    const oldFoul = expectAccepted(owed.execute({ type: 'foul.commit', seat: 'A' }))
    expect(owed.getScore()).toEqual({ A: -1, B: 0 })
    expect(oldFoul.gameProtocolEntries[0].body).toEqual({
      commandType: 'foul.commit',
      penalty: 'offender-minus-one',
    })
  })

  test('long free pyramid table counts and rack rollover remain correct', () => {
    const session = createGameplaySession('free-pyramid-long', {
      targetPointsBySeat: { A: 30, B: 30 },
      rackRollover: 14,
    })

    expectAccepted(session.execute({ type: 'frame.commence', seat: 'A' }))

    for (const pottedBallCount of [4, 4, 4, 2] as const) {
      expectAccepted(session.execute({ type: 'pot.record', seat: 'A', pottedBallCount }))
    }

    const controlProjection = session.deriveControls()
    expect(session.getScore()).toEqual({ A: 14, B: 0 })
    expect(controlProjection.game.details.ballsOnTable).toBe(16)
    expect(controlProjection.game.details.rackHistory).toEqual([
      { rackNumber: 1, scoreBySeat: { A: 14, B: 0 } },
      { rackNumber: 2, scoreBySeat: { A: 0, B: 0 } },
    ])
    expect(controlProjection.game.details.messages).toEqual([{ code: 'rack-started', rackNumber: 2 }])
  })

  test('rejected commands retain state and produce no protocol entries', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 } })
    expectAccepted(session.execute({ type: 'frame.commence', seat: 'A' }))
    const score = session.getScore()
    const controlProjection = session.deriveControls()
    expect(session.execute({ type: 'pot.record', seat: 'A', pottedBallCount: 3 })).toEqual({
      _tag: 'rejected',
      reason: { code: 'command-not-available' },
    })
    expect(session.getScore()).toEqual(score)
    expect(session.deriveControls()).toEqual(controlProjection)
  })
})
