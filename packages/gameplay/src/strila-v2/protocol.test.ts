import { describe, expect, test } from 'bun:test'

import { applyGameCommand, createInitialGameState } from '../gameplay'
import { type StrilaCommand, type StrilaFrameState, StrilaMeta } from './definitions'
import { projectStrilaProtocolEntries } from './protocol'

function apply(state: StrilaFrameState, command: StrilaCommand): StrilaFrameState {
  const { type: commandType, ...payload } = command
  return applyGameCommand({ gameKey: 'strila-v2', state, commandType, command: payload }).state
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
      winnerDeterminationReason: null,
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
      winnerDeterminationReason: null,
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
      winnerDeterminationReason: null,
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
    let previous = createInitialGameState('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    previous = apply(previous, { type: 'frame.commence', seat: 'A' })
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
