import { describe, expect, test } from 'bun:test'

import { type StrilaFrameState, StrilaMeta } from '../definitions'
import { deriveStrilaControlView } from './control'

const baseState = {
  score: { A: 0, B: 0 },
  targetPoints: StrilaMeta.defaultTargetPoints,
  coloredBallsOnTable: [1, 2, 3, 4, 5, 6, 7],
  cueBallSerialPots: null,
  foulOffender: null,
  winner: null,
  winnerDeterminationReason: null,
  phase: 'not-started',
} satisfies StrilaFrameState

describe('projection: control', () => {
  test('not-started waits for match-owned break-off', () => {
    const state: StrilaFrameState = {
      ...baseState,
    }

    expect(deriveStrilaControlView(state)).toEqual({
      gameKey: 'strila-v2',
      projection: 'control',
      score: { A: 0, B: 0 },
      details: {
        phase: 'not-started',
        situationTitle: 'Break-off',
        seat: undefined,
        situationSummary: 'Waiting for the match to open the frame.',
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
          neutral: [],
          primary: {
            A: [],
            B: [],
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
      ...baseState,
      score: { A: 4, B: 0 },
      coloredBallsOnTable: [2, 3, 4, 5, 6, 7],
      foulOffender: 'A',
      phase: 'foul-committed.penalty-selection',
    }

    const view = deriveStrilaControlView(state)
    expect(view.details.seat).toBe('B')
    expect(view.details.commandSections.secondary.B.map((entry) => entry.commandType)).toEqual([
      'penalty.select',
      'penalty.select',
      'penalty.select',
    ])
    expect(view.details.messages).toEqual([])
    expect(view.details.commandSections.secondary.B.map((entry) => entry.command.choice)).toEqual([
      'play-from-position',
      'pass-position',
      'ball-in-hand',
    ])
  })

  test('respotted-black-play exposes only game action commands', () => {
    const state: StrilaFrameState = {
      ...baseState,
      score: { A: 8, B: 8 },
      coloredBallsOnTable: [7],
      phase: 'respotted-black.play',
    }

    const view = deriveStrilaControlView(state)
    expect(view.details.commandSections.primary.A.map((entry) => `${entry.commandType}:${entry.command.seat}`)).toEqual([
      'pot.record:A',
    ])
    expect(view.details.commandSections.primary.B.map((entry) => `${entry.commandType}:${entry.command.seat}`)).toEqual([
      'pot.record:B',
    ])
    expect(view.details.commandSections.secondary.A.map((entry) => `${entry.commandType}:${entry.command.seat}`)).toEqual([
      'foul.commit:A',
    ])
    expect(view.details.commandSections.tertiary.A.map((entry) => `${entry.commandType}:${entry.command.seat}`)).toEqual([])
    expect(view.details.commandSections.tertiary.B.map((entry) => `${entry.commandType}:${entry.command.seat}`)).toEqual([])
    expect(view.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual(['pot.record'])
    expect(view.details.commandSections.secondary.A.map((entry) => entry.commandType)).toEqual(['foul.commit'])
    expect(view.details.commandSections.tertiary.A.map((entry) => entry.commandType)).toEqual([])
    expect(view.details.commandSections.tertiary.B.map((entry) => entry.commandType)).toEqual([])
  })

  test('winner-determined keeps frame.award and pot.record', () => {
    const state: StrilaFrameState = {
      ...baseState,
      score: { A: 4, B: 9 },
      coloredBallsOnTable: [6, 7],
      winner: 'B',
      winnerDeterminationReason: 'target-reached',
      phase: 'winner-determined',
    }

    const view = deriveStrilaControlView(state)
    expect(view.details.seat).toBe('B')
    expect(view.details.commandSections.primary.B.map((entry) => entry.commandType)).toEqual(['pot.record', 'frame.award'])
  })

  test('respotted-black-opening explains the restriction', () => {
    const state: StrilaFrameState = {
      ...baseState,
      score: { A: 8, B: 8 },
      coloredBallsOnTable: [7],
      phase: 'respotted-black.opening',
    }

    const view = deriveStrilaControlView(state)
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
    expect(view.details.messages).toEqual([{ type: 'hint', code: 'black-pot-wins' }])
    expect(view.details.commandSections.primary.A[0]).toEqual({
      source: 'game',
      commandType: 'pot.record',
      command: { seat: 'A' },
      seat: 'A',
      prominence: 'primary',
    })
    expect([
      ...view.details.commandSections.primary.A.map((entry) => entry.commandType),
      ...view.details.commandSections.secondary.A.map((entry) => entry.commandType),
      ...view.details.commandSections.tertiary.A.map((entry) => entry.commandType),
    ]).toEqual(['pot.record', 'miss.record', 'foul.commit'])
  })

  test('ball in hand warns that cue and colored balls together are a foul', () => {
    const view = deriveStrilaControlView({
      ...baseState,
      foulOffender: 'A',
      phase: 'foul-committed.ball-in-hand',
    })

    expect(view.details.messages).toEqual([{ type: 'warning', code: 'cue-ball-and-colored-is-foul' }])
  })
})
