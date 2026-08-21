import { describe, expect, test } from 'bun:test'

import type { BySeatNumber } from '@ks/core'

import { StrilaMeta } from './definitions'
import { createInitialSnapshot, getPhase, sendEvent, type StrilaSparringFrameSnapshot } from './machine'

function start(targetPointsBySeat?: BySeatNumber): StrilaSparringFrameSnapshot {
  return createInitialSnapshot(targetPointsBySeat ?? StrilaMeta.defaultTargetPoints)
}

// A:6, B:8, only ball 7 left → A pots 7 → 8:8, table empty → respotted-black.opening
function reachRespottedBlack(): StrilaSparringFrameSnapshot {
  let snap = start()
  snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
  snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })
  snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [2] })
  snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [3] })
  snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [4] })
  snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [5] })
  snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [6] })
  snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
  snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'play-from-position' }) // B:7
  snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
  snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'play-from-position' }) // B:8
  snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [7] }) // A:8, table empty → 8:8
  expect(getPhase(snap)).toBe('respotted-black.opening')
  return snap
}

describe('machine-sparring: basic', () => {
  test('frame.commence enters open-play for seat', () => {
    const snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })

    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallSerialPots).toBeNull()
    expect(snap.context.score).toEqual({ A: 0, B: 0 })
    expect(snap.context.coloredBallsOnTable).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  test('target reached becomes winner-determined until frame.award', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [2] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [3] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [4] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [5] })

    expect(snap.context.score).toEqual({ A: 10, B: 0 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winnerDeterminationReason).toBe('target-reached')
  })

  test('frame.award closes a winner-determined frame', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [2] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [3] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [4] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [5] })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })

    expect(getPhase(snap)).toBe('frame-over')
  })
})

describe('machine-sparring: foul handling', () => {
  test('foul then ball-in-hand then miss returns to opponent open-play', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(getPhase(snap)).toBe('foul-committed.penalty-selection')
    expect(snap.context.foulOffender).toBe('A')

    snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' })
    expect(getPhase(snap)).toBe('foul-committed.ball-in-hand')

    snap = sendEvent(snap, { type: 'miss.record', seat: 'B' })
    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallSerialPots).toBeNull()
  })

  test('foul response play-from-position awards one point to chooser and keeps seat', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'play-from-position' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallSerialPots).toBeNull()
  })

  test('foul response pass-position awards one point to chooser and returns seat to offender', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'pass-position' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallSerialPots).toBeNull()
  })

  test('opponent-foul ball-in-hand cue ball and colored ball together becomes a foul', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' })

    const before = snap
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0, 3] })

    expect(snap.context.score).toEqual({ A: 0, B: 0 })
    expect(snap.context.coloredBallsOnTable).toEqual(before.context.coloredBallsOnTable)
    expect(getPhase(snap)).toBe('foul-committed.penalty-selection')
    expect(snap.context.foulOffender).toBe('B')
  })

  test('third consecutive cue ball pot becomes an automatic foul', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0, 1] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0, 2] })

    const before = snap
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })

    expect(snap.context.score).toEqual(before.context.score)
    expect(snap.context.coloredBallsOnTable).toEqual(before.context.coloredBallsOnTable)
    expect(getPhase(snap)).toBe('foul-committed.penalty-selection')
    expect(snap.context.foulOffender).toBe('A')
  })
})

describe('machine-sparring: respotted black', () => {
  test('entering respotted-black.opening after 8:8 tie with last ball potted', () => {
    const snap = reachRespottedBlack()

    expect(snap.context.score).toEqual({ A: 8, B: 8 })
    expect(snap.context.coloredBallsOnTable).toEqual([7])
  })

  test('opening black pot determines winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [7] })

    expect(snap.context.score).toEqual({ A: 10, B: 8 })
    expect(snap.context.coloredBallsOnTable).toEqual([])
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winnerDeterminationReason).toBe('respotted-black-won')
  })

  test('opening non-black pot determines opponent as winner (automatic foul)', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winnerDeterminationReason).toBe('automatic-foul')
    expect(snap.context.coloredBallsOnTable).toEqual([7])
  })

  test('opening cue ball plus black pot still determines opponent winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0, 7] })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winnerDeterminationReason).toBe('automatic-foul')
    expect(snap.context.coloredBallsOnTable).toEqual([7])
  })

  test('opening miss enters respotted-black.play for opponent', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'miss.record', seat: 'A' })

    expect(getPhase(snap)).toBe('respotted-black.play')
  })

  test('respotted-black.play pot determines winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'miss.record', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [7] })

    expect(snap.context.score).toEqual({ A: 8, B: 10 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winnerDeterminationReason).toBe('respotted-black-won')
  })

  test('respotted-black.play cue ball pot determines winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'miss.record', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0] })

    expect(snap.context.score).toEqual({ A: 8, B: 9 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winnerDeterminationReason).toBe('respotted-black-won')
  })

  test('foul in respotted-black.play determines opponent as winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'miss.record', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'B' })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winnerDeterminationReason).toBe('automatic-foul')
  })

  test('foul in respotted-black.opening determines opponent as winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winnerDeterminationReason).toBe('automatic-foul')
  })
})

describe('machine-sparring: handicap', () => {
  test('handicap target lets A win at 6 after three pots', () => {
    let snap = start({ A: 6, B: 9 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [2] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [3] })

    expect(snap.context.score).toEqual({ A: 6, B: 0 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winnerDeterminationReason).toBe('target-reached')
  })
})

describe('machine-sparring: continued break after winner', () => {
  test('pot.record in winner-determined continues scoring', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [2] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [3] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [4] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [5] })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score.A).toBe(10)

    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [6] })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score.A).toBe(12)
  })
})

describe('machine-sparring: ball validation', () => {
  test('rejects events that are invalid for the current phase', () => {
    const snap = start()

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })).toThrow(
      'Invalid Strila event pot.record in phase not-started',
    )
  })

  test('pot.record rejects colored ball not on table', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })).toThrow(
      'Potted ball 1 is not on the table',
    )
  })
})
