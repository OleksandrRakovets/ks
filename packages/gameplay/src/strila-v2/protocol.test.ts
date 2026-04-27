import { describe, expect, test } from 'bun:test'

import type { StrilaCommand, StrilaFrameState } from './definitions'
import { projectStrilaProtocolEntries } from './protocol'
import { StrilaGameplayRuntime } from './runtime'

const DEFAULT_TARGETS = { A: 9, B: 9 } as const
const runtime = new StrilaGameplayRuntime()

function apply(state: StrilaFrameState, command: StrilaCommand): StrilaFrameState {
  return runtime.applyCommand({ state, commandType: command.type, command }).state as StrilaFrameState
}

describe('protocol projection', () => {
  test('respotted black declaration', () => {
    const previous: StrilaFrameState = {
      score: { A: 6, B: 8 },
      targetPoints: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      cueBallSerialPots: null,
      foulOffender: null,
      winner: null,
      winReason: null,
      phase: 'open-play',
    }
    const command: StrilaCommand = { type: 'pot.record', actor: 'A', pottedBalls: [7] }
    const next = apply(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      { source: 'player', command },
      { source: 'system', systemType: 'respotted-black-declared' },
    ])
  })

  test('automatic foul for third consecutive cue ball pot', () => {
    const previous: StrilaFrameState = {
      score: { A: 2, B: 0 },
      targetPoints: DEFAULT_TARGETS,
      coloredBallsOnTable: [5, 7],
      cueBallSerialPots: { seat: 'A', count: 2 },
      foulOffender: null,
      winner: null,
      winReason: null,
      phase: 'open-play',
    }
    const command: StrilaCommand = { type: 'pot.record', actor: 'A', pottedBalls: [0] }
    const next = apply(previous, command)

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
      targetPoints: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      cueBallSerialPots: null,
      foulOffender: null,
      winner: null,
      winReason: null,
      phase: 'respotted-black.opening',
    }
    const command: StrilaCommand = { type: 'pot.record', actor: 'A', pottedBalls: [0] }
    const next = apply(previous, command)

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
    let previous = runtime.createInitialState({ targetPointsBySeat: DEFAULT_TARGETS })
    previous = apply(previous, { type: 'frame.commence', actor: 'A' })
    previous = apply(previous, { type: 'pot.record', actor: 'A', pottedBalls: [1, 2, 3, 4] })
    const command: StrilaCommand = { type: 'pot.record', actor: 'A', pottedBalls: [5] }
    const next = apply(previous, command)

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
