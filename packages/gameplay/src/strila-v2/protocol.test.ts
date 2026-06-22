import { describe, expect, test } from 'bun:test'

import { StrilaMeta, type StrilaCommand, type StrilaFrameState } from './definitions'
import { projectStrilaProtocolEntries } from './protocol'
import { StrilaGameplayRuntime } from './runtime'

const runtime = new StrilaGameplayRuntime()

function apply(state: StrilaFrameState, command: StrilaCommand): StrilaFrameState {
  return runtime.parseState(runtime.applyCommand({ state, commandType: command.type, command }).state)
}

describe('protocol projection', () => {
  test('respotted black declaration', () => {
    const previous: StrilaFrameState = {
      score: { A: 6, B: 8 },
      targetPoints: StrilaMeta.defaultTargetPoints,
      coloredBallsOnTable: [7],
      cueBallSerialPots: null,
      foulOffender: null,
      winner: null,
      winReason: null,
      phase: 'open-play',
    }
    const command: StrilaCommand = { type: 'pot.record', seat: 'A', pottedBalls: [7] }
    const next = apply(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      {
        source: 'player',
        entryType: 'player-command',
        seat: 'A',
        scoreAfter: { A: 8, B: 8 },
        body: { commandType: 'pot.record', pottedBalls: [7] },
      },
      { source: 'system', entryType: 'system-note', body: { systemType: 'respotted-black-declared' } },
    ])
  })

  test('automatic foul for third consecutive cue ball pot', () => {
    const previous: StrilaFrameState = {
      score: { A: 2, B: 0 },
      targetPoints: StrilaMeta.defaultTargetPoints,
      coloredBallsOnTable: [5, 7],
      cueBallSerialPots: { seat: 'A', count: 2 },
      foulOffender: null,
      winner: null,
      winReason: null,
      phase: 'open-play',
    }
    const command: StrilaCommand = { type: 'pot.record', seat: 'A', pottedBalls: [0] }
    const next = apply(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      {
        source: 'player',
        entryType: 'player-command',
        seat: 'A',
        body: { commandType: 'pot.record', pottedBalls: [0] },
      },
      {
        source: 'system',
        entryType: 'system-note',
        seat: 'A',
        body: { systemType: 'automatic-foul', reason: 'third-consecutive-cue-ball-pot' },
      },
    ])
  })

  test('automatic foul and winner for illegal opening cue ball pot', () => {
    const previous: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPoints: StrilaMeta.defaultTargetPoints,
      coloredBallsOnTable: [7],
      cueBallSerialPots: null,
      foulOffender: null,
      winner: null,
      winReason: null,
      phase: 'respotted-black.opening',
    }
    const command: StrilaCommand = { type: 'pot.record', seat: 'A', pottedBalls: [0] }
    const next = apply(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      {
        source: 'player',
        entryType: 'player-command',
        seat: 'A',
        body: { commandType: 'pot.record', pottedBalls: [0] },
      },
      {
        source: 'system',
        entryType: 'system-note',
        seat: 'A',
        body: { systemType: 'automatic-foul', reason: 'respotted-black-opening-illegal-pot' },
      },
      {
        source: 'system',
        entryType: 'system-note',
        seat: 'B',
        body: { systemType: 'winner-determined', reason: 'automatic-foul' },
      },
    ])
  })

  test('target reached winner determination', () => {
    let previous = runtime.createInitialState({ targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    previous = apply(previous, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4] })
    const command: StrilaCommand = { type: 'pot.record', seat: 'A', pottedBalls: [5] }
    const next = apply(previous, command)

    expect(projectStrilaProtocolEntries({ previous, command, next })).toEqual([
      {
        source: 'player',
        entryType: 'player-command',
        seat: 'A',
        scoreAfter: { A: 10, B: 0 },
        body: { commandType: 'pot.record', pottedBalls: [5] },
      },
      {
        source: 'system',
        entryType: 'system-note',
        seat: 'A',
        body: { systemType: 'winner-determined', reason: 'target-reached' },
      },
    ])
  })
})
