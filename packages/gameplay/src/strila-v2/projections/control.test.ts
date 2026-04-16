import { describe, expect, test } from 'bun:test'

import type { StrilaFrameState } from '../definitions'
import { deriveStrilaControlView } from './control'

const DEFAULT_TARGETS = { A: 9, B: 9 } as const

describe('projection: control', () => {
  test('not-started exposes frame.commence', () => {
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
        { commandType: 'frame.commence', command: { actor: 'A' }, label: 'Break-off (A)' },
        { commandType: 'frame.commence', command: { actor: 'B' }, label: 'Break-off (B)' },
      ],
      details: {
        phase: 'not-started',
        situationTitle: 'Break-off',
        situationSummary: 'Record the opening shot.',
        activeBalls: { active: [1, 2], inactive: [3, 4, 5, 6, 7] },
      },
    })
  })

  test('penalty-selection exposes the three response choices', () => {
    const state: StrilaFrameState = {
      score: { A: 4, B: 0 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [2, 3, 4, 5, 6, 7],
      phase: { type: 'penalty-selection', chooser: 'B', offender: 'A', forcedBallInHand: false },
    }

    const view = deriveStrilaControlView(state)
    expect(view.details.actor).toBe('B')
    expect(view.availableCommands).toEqual([
      {
        commandType: 'penalty.select',
        command: { actor: 'B', choice: 'play-from-position' },
        label: 'Play from position',
        effectSummary: '+1 point',
      },
      {
        commandType: 'penalty.select',
        command: { actor: 'B', choice: 'pass-position' },
        label: 'Pass position',
        effectSummary: '+1 point',
      },
      {
        commandType: 'penalty.select',
        command: { actor: 'B', choice: 'ball-in-hand' },
        label: 'Ball in hand',
      },
    ])
  })

  test('winner-determined keeps frame.award and pot.record', () => {
    const state: StrilaFrameState = {
      score: { A: 4, B: 9 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [6, 7],
      phase: { type: 'winner-determined', winner: 'B', actor: 'B', reason: 'target-reached' },
    }

    const view = deriveStrilaControlView(state)
    expect(view.details.actor).toBe('B')
    expect(view.availableCommands.map((entry) => entry.commandType)).toEqual(['pot.record', 'frame.award'])
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
      commandType: 'pot.record',
      command: { actor: 'A' },
      label: 'Record pot',
      helpText: 'A black pot wins. Any other potted result is treated as a foul.',
    })
    expect(view.availableCommands.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'miss.record',
      'foul.commit',
      'frame.concede',
    ])
  })
})
