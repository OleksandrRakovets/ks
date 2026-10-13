import { describe, expect, test } from 'bun:test'

import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { type GameCommandExecution, GameProtocolEntry } from './gameplay-session'
import { createGameplaySession } from './session-factory'

function expectAccepted(result: GameCommandExecution): Extract<GameCommandExecution, { _tag: 'accepted' }> {
  expect(result._tag).toBe('accepted')

  invariant(result._tag === 'accepted', 'Expected accepted gameplay command')
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
})
