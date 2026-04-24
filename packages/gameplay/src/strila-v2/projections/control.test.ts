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
        { commandType: 'frame.commence', command: { actor: 'A' }, label: 'Break-off', prominence: 'primary' },
        { commandType: 'frame.commence', command: { actor: 'B' }, label: 'Break-off', prominence: 'primary' },
      ],
      details: {
        phase: 'not-started',
        situationTitle: 'Break-off',
        situationSummary: 'Record the opening shot.',
        isPotCommandAvailable: false,
        ballStatuses: {
          0: 'object',
          1: 'object',
          2: 'object',
          3: 'on-table',
          4: 'on-table',
          5: 'on-table',
          6: 'on-table',
          7: 'on-table',
        },
        commandSections: {
          primary: {
            A: [{ commandType: 'frame.commence', command: { actor: 'A' }, label: 'Break-off', prominence: 'primary' }],
            B: [{ commandType: 'frame.commence', command: { actor: 'B' }, label: 'Break-off', prominence: 'primary' }],
          },
          secondary: { A: [], B: [] },
          tertiary: { A: [], B: [] },
        },
        messages: [],
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
    expect(view.details.commandSections.secondary.B.map((entry) => entry.commandType)).toEqual([
      'penalty.select',
      'penalty.select',
      'penalty.select',
    ])
    expect(view.details.messages).toEqual([])
    expect(view.availableCommands).toEqual([
      {
        commandType: 'penalty.select',
        command: { actor: 'B', choice: 'play-from-position' },
        label: 'Play from position',
        prominence: 'secondary',
        effectSummary: '+1 point',
      },
      {
        commandType: 'penalty.select',
        command: { actor: 'B', choice: 'pass-position' },
        label: 'Pass position',
        prominence: 'secondary',
        effectSummary: '+1 point',
      },
      {
        commandType: 'penalty.select',
        command: { actor: 'B', choice: 'ball-in-hand' },
        label: 'Ball in hand',
        prominence: 'secondary',
        effectSummary: 'No points awarded',
      },
    ])
  })

  test('respotted-black-play exposes action commands for active actor, frame.concede for both', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-play', actor: 'A' },
    }

    const view = deriveStrilaControlView(state)
    expect(view.availableCommands.map((c) => `${c.commandType}:${(c.command as { actor: string }).actor}`)).toEqual([
      'pot.record:A',
      'foul.commit:A',
      'frame.concede:A',
      'frame.concede:B',
    ])
    expect(view.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual(['pot.record'])
    expect(view.details.commandSections.secondary.A.map((entry) => entry.commandType)).toEqual(['foul.commit'])
    expect(view.details.commandSections.tertiary.A.map((entry) => entry.commandType)).toEqual(['frame.concede'])
    expect(view.details.commandSections.tertiary.B.map((entry) => entry.commandType)).toEqual(['frame.concede'])
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
    expect(view.details.ballStatuses).toEqual({
      0: 'on-table',
      1: 'potted',
      2: 'potted',
      3: 'potted',
      4: 'potted',
      5: 'potted',
      6: 'potted',
      7: 'object',
    })
    expect(view.details.messages).toEqual([
      { type: 'hint', text: 'A black pot wins. Any other potted result is treated as a foul.' },
    ])
    expect(view.availableCommands[0]).toEqual({
      commandType: 'pot.record',
      command: { actor: 'A' },
      label: 'Record pot',
      prominence: 'primary',
    })
    expect(view.availableCommands.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'miss.record',
      'foul.commit',
      'frame.concede',
    ])
  })
})
