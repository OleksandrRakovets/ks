import { describe, expect, test } from 'bun:test'

import type { StrilaFrameState } from '../definitions'
import { deriveStrilaControlView } from './control'

describe('projection: control', () => {
  test('not-started exposes break-off', () => {
    const state: StrilaFrameState = {
      score: { A: 0, B: 0 },
      coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
      phase: { type: 'not-started' },
    }

    expect(deriveStrilaControlView(state)).toEqual({
      gameKey: 'strila-v2',
      phase: 'not-started',
      situationTitle: 'Break-off',
      situationSummary: 'Record the opening break-off shot.',
      score: { A: 0, B: 0 },
      activeBalls: { active: [1, 2], inactive: [3, 4, 5, 6, 7] },
      availableActions: [{ id: 'break-off', label: 'Break-off' }],
    })
  })

  test('foul-response exposes the three response choices', () => {
    const state: StrilaFrameState = {
      score: { A: 4, B: 0 },
      coloredBallsOnTable: [2, 3, 4, 5, 6, 7],
      phase: { type: 'foul-response', chooser: 'B', offender: 'A', forcedBallInHand: false },
    }

    const view = deriveStrilaControlView(state)
    expect(view.actor).toBe('B')
    expect(view.availableActions.map((entry) => entry.id)).toEqual([
      'choose-play-from-position',
      'choose-pass-position',
      'choose-ball-in-hand',
      'concede-frame',
    ])
  })

  test('winner-determined keeps award-frame and record-pot', () => {
    const state: StrilaFrameState = {
      score: { A: 4, B: 9 },
      coloredBallsOnTable: [6, 7],
      phase: { type: 'winner-determined', winner: 'B', actor: 'B', reason: 'target-reached' },
    }

    const view = deriveStrilaControlView(state)
    expect(view.actor).toBe('B')
    expect(view.availableActions.map((entry) => entry.id)).toEqual(['record-pot', 'award-frame', 'concede-frame'])
  })

  test('respotted-black-opening explains the restriction', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-opening', actor: 'A' },
    }

    const view = deriveStrilaControlView(state)
    expect(view.actor).toBe('A')
    expect(view.activeBalls).toEqual({ active: [7], inactive: [] })
    expect(view.availableActions[0]).toEqual({
      id: 'record-pot',
      label: 'Record pot',
      helpText: 'A black pot wins. Any other potted result is treated as a foul.',
    })
    expect(view.availableActions.map((entry) => entry.id)).toEqual([
      'record-pot',
      'record-miss',
      'foul-committed',
      'concede-frame',
    ])
  })

})
