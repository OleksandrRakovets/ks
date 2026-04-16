import { describe, expect, test } from 'bun:test'

import type { StrilaFrameState } from '../definitions'
import { deriveStrilaControlView } from './control'

const DEFAULT_TARGETS = { A: 9, B: 9 } as const

describe('projection: control', () => {
  test('not-started exposes break-off', () => {
    const state: StrilaFrameState = {
      score: { A: 0, B: 0 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
      phase: { type: 'not-started' },
    }

    expect(deriveStrilaControlView(state)).toEqual({
      gameKey: 'strila-v2',
      projection: 'control',
      score: { A: 0, B: 0 },
      availableCommands: [
        { commandType: 'break-off', command: { actor: 'A' }, label: 'Break-off (A)' },
        { commandType: 'break-off', command: { actor: 'B' }, label: 'Break-off (B)' },
      ],
      details: {
        phase: 'not-started',
        situationTitle: 'Break-off',
        situationSummary: 'Record the opening break-off shot.',
        activeBalls: { active: [1, 2], inactive: [3, 4, 5, 6, 7] },
      },
    })
  })

  test('foul-response exposes the three response choices', () => {
    const state: StrilaFrameState = {
      score: { A: 4, B: 0 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [2, 3, 4, 5, 6, 7],
      phase: { type: 'foul-response', chooser: 'B', offender: 'A', forcedBallInHand: false },
    }

    const view = deriveStrilaControlView(state)
    expect(view.details.actor).toBe('B')
    expect(view.availableCommands).toEqual([
      {
        commandType: 'choose-foul-response',
        command: { actor: 'B', choice: 'play-from-position' },
        label: 'Play from position',
        effectSummary: '+1 point',
      },
      {
        commandType: 'choose-foul-response',
        command: { actor: 'B', choice: 'pass-position' },
        label: 'Pass position',
        effectSummary: '+1 point',
      },
      {
        commandType: 'choose-foul-response',
        command: { actor: 'B', choice: 'ball-in-hand' },
        label: 'Ball in hand',
      },
      {
        commandType: 'concede-frame',
        command: { actor: 'B' },
        label: 'Concede frame',
      },
    ])
  })

  test('winner-determined keeps award-frame and record-pot', () => {
    const state: StrilaFrameState = {
      score: { A: 4, B: 9 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [6, 7],
      phase: { type: 'winner-determined', winner: 'B', actor: 'B', reason: 'target-reached' },
    }

    const view = deriveStrilaControlView(state)
    expect(view.details.actor).toBe('B')
    expect(view.availableCommands.map((entry) => entry.commandType)).toEqual(['record-pot', 'award-frame'])
  })

  test('respotted-black-opening explains the restriction', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-opening', actor: 'A' },
    }

    const view = deriveStrilaControlView(state)
    expect(view.details.actor).toBe('A')
    expect(view.details.activeBalls).toEqual({ active: [7], inactive: [] })
    expect(view.availableCommands[0]).toEqual({
      commandType: 'record-pot',
      command: { actor: 'A' },
      label: 'Record pot',
      helpText: 'A black pot wins. Any other potted result is treated as a foul.',
    })
    expect(view.availableCommands.map((entry) => entry.commandType)).toEqual([
      'record-pot',
      'record-miss',
      'foul-committed',
      'concede-frame',
    ])
  })
})
