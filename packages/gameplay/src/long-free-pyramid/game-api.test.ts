import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { applyGameCommand, createInitialGameState, deriveGameControl } from '../gameplay'
import { LongFreePyramidControlViewSchema, LongFreePyramidFrameStateSchema } from './definitions'

describe('long free pyramid: game api', () => {
  test('requires and stores rack rollover configuration', () => {
    expect(() =>
      createInitialGameState('free-pyramid-long', { targetPointsBySeat: { A: 30, B: 30 }, breakerSeat: 'A' }),
    ).toThrow('Long free pyramid requires rackRollover 14 or 15')

    expect(
      createInitialGameState('free-pyramid-long', {
        targetPointsBySeat: { A: 30, B: 30 },
        breakerSeat: 'A',
        gameConfiguration: { rackRollover: 14 },
      }),
    ).toEqual({
      racks: [{ rackNumber: 1, scoreBySeat: { A: 0, B: 0 } }],
      targetPointsBySeat: { A: 30, B: 30 },
      rackRollover: 14,
      phase: 'not-started',
      messages: [],
      winner: null,
    })
  })

  test('tracks racks and rolls over without completing the frame', () => {
    let state = createInitialGameState('free-pyramid-long', {
      targetPointsBySeat: { A: 30, B: 30 },
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: 14 },
    })
    ;({ state } = applyGameCommand({
      gameKey: 'free-pyramid-long',
      state,
      commandType: 'frame.commence',
      command: { seat: 'A' },
    }))
    for (const points of [4, 4, 4, 1]) {
      ;({ state } = applyGameCommand({
        gameKey: 'free-pyramid-long',
        state,
        commandType: 'pot.record',
        command: { seat: 'A', points },
      }))
    }
    ;({ state } = applyGameCommand({
      gameKey: 'free-pyramid-long',
      state,
      commandType: 'pot.record',
      command: { seat: 'B', points: 2 },
    }))

    expect(state).toEqual({
      racks: [
        { rackNumber: 1, scoreBySeat: { A: 13, B: 2 } },
        { rackNumber: 2, scoreBySeat: { A: 0, B: 0 } },
      ],
      targetPointsBySeat: { A: 30, B: 30 },
      rackRollover: 14,
      phase: 'open-play',
      messages: [{ code: 'rack-started', rackNumber: 2 }],
      winner: null,
    })

    const projection = v.parse(LongFreePyramidControlViewSchema, deriveGameControl('free-pyramid-long', state))
    expect(projection.score).toEqual({ A: 13, B: 2 })
    expect(projection.details.ballsOnTable).toBe(16)
    expect(projection.details.ballsRemoved).toBe(0)
    expect(projection.details.messages).toEqual([{ code: 'rack-started', rackNumber: 2 }])
    expect(projection.details.commandSections.secondary.A.map((entry) => entry.command.points)).toContain(4)
  })

  test('winner flow keeps first winner and restricts award', () => {
    let state = createInitialGameState('free-pyramid-long', {
      targetPointsBySeat: { A: 4, B: 4 },
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: 15 },
    })
    ;({ state } = applyGameCommand({
      gameKey: 'free-pyramid-long',
      state,
      commandType: 'frame.commence',
      command: { seat: 'A' },
    }))
    ;({ state } = applyGameCommand({
      gameKey: 'free-pyramid-long',
      state,
      commandType: 'pot.record',
      command: { seat: 'A', points: 4 },
    }))
    let parsedState = v.parse(LongFreePyramidFrameStateSchema, state)
    expect(parsedState.phase).toBe('winner-determined')
    expect(parsedState.winner).toBe('A')

    const winnerControl = v.parse(LongFreePyramidControlViewSchema, deriveGameControl('free-pyramid-long', state))
    expect(winnerControl.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual(['frame.award'])
    expect(winnerControl.details.commandSections.primary.B).toEqual([])
    expect(
      winnerControl.details.commandSections.secondary.A.map((entry) => `${entry.commandType}:${entry.command.points}`),
    ).toEqual(['pot.record:1'])
    expect(winnerControl.details.commandSections.secondary.B).toEqual([])

    expect(() =>
      applyGameCommand({ gameKey: 'free-pyramid-long', state, commandType: 'pot.record', command: { seat: 'B', points: 1 } }),
    ).toThrow('Command not available')

    ;({ state } = applyGameCommand({ gameKey: 'free-pyramid-long', state, commandType: 'foul.commit', command: { seat: 'A' } }))
    parsedState = v.parse(LongFreePyramidFrameStateSchema, state)
    expect(parsedState.phase).toBe('awaiting-award')
    expect(parsedState.winner).toBe('A')

    const result = applyGameCommand({ gameKey: 'free-pyramid-long', state, commandType: 'frame.award', command: { seat: 'A' } })
    expect(result.outcome).toEqual({ winnerSeat: 'A', score: { A: 4, B: 1 }, winReason: 'target-reached' })
  })
})
