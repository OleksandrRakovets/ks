import { describe, expect, test } from 'bun:test'

import type { StrilaCommand, StrilaFrameState } from './definitions'
import { projectStrilaProtocolEntries } from './protocol'
import { createEmptyStrilaFrameState, reduceStrilaCommand } from './reducer'

const DEFAULT_TARGETS = { A: 9, B: 9 } as const

describe('protocol projection', () => {
  test('respotted black declaration', () => {
    const previous: StrilaFrameState = {
      score: { A: 6, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 0 },
    }
    const command: StrilaCommand = { type: 'pot.record', actor: 'A', pottedBalls: [7] }
    const next = reduceStrilaCommand(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      { source: 'player', command },
      { source: 'system', systemType: 'respotted-black-declared' },
    ])
  })

  test('automatic foul for third consecutive cue ball pot', () => {
    const previous: StrilaFrameState = {
      score: { A: 2, B: 0 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [5, 7],
      phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 2 },
    }
    const command: StrilaCommand = { type: 'pot.record', actor: 'A', pottedBalls: [0] }
    const next = reduceStrilaCommand(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      { source: 'player', command },
      {
        source: 'system',
        systemType: 'automatic-foul',
        offender: 'A',
        reason: 'third-consecutive-cue-ball-pot',
      },
    ])
  })

  test('automatic foul and winner for illegal opening cue ball pot', () => {
    const previous: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-opening', actor: 'A' },
    }
    const command: StrilaCommand = { type: 'pot.record', actor: 'A', pottedBalls: [0] }
    const next = reduceStrilaCommand(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      { source: 'player', command },
      {
        source: 'system',
        systemType: 'automatic-foul',
        offender: 'A',
        reason: 'respotted-black-opening-illegal-pot',
      },
      {
        source: 'system',
        systemType: 'winner-determined',
        winner: 'B',
        reason: 'automatic-foul',
      },
    ])
  })

  test('target reached winner determination', () => {
    let previous = reduceStrilaCommand(createEmptyStrilaFrameState(DEFAULT_TARGETS), { type: 'frame.commence', actor: 'A' })
    previous = reduceStrilaCommand(previous, { type: 'pot.record', actor: 'A', pottedBalls: [1, 2, 3, 4] })
    const command: StrilaCommand = { type: 'pot.record', actor: 'A', pottedBalls: [5] }
    const next = reduceStrilaCommand(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      { source: 'player', command },
      {
        source: 'system',
        systemType: 'winner-determined',
        winner: 'A',
        reason: 'target-reached',
      },
    ])
  })
})
