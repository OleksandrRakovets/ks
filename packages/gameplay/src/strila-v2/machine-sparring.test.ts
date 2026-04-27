import { describe, expect, test } from 'bun:test'

import { createInitialSnapshot, getPhase, sendEvent, type StrilaSparringSnapshot } from './machine-sparring'

function start(targetPointsBySeat?: { A: number; B: number }): StrilaSparringSnapshot {
  return createInitialSnapshot(targetPointsBySeat)
}

// A:6, B:8, only ball 7 left → A pots 7 → 8:8, table empty → respotted-black.opening
function reachRespottedBlack(): StrilaSparringSnapshot {
  let snap = start()
  snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
  snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [1] })
  snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [2] })
  snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [3] })
  snap = sendEvent(snap, { type: 'pot.record', actor: 'B', pottedBalls: [4] })
  snap = sendEvent(snap, { type: 'pot.record', actor: 'B', pottedBalls: [5] })
  snap = sendEvent(snap, { type: 'pot.record', actor: 'B', pottedBalls: [6] })
  snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })
  snap = sendEvent(snap, { type: 'penalty.select', actor: 'B', choice: 'play-from-position' }) // B:7
  snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })
  snap = sendEvent(snap, { type: 'penalty.select', actor: 'B', choice: 'play-from-position' }) // B:8
  snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [7] }) // A:8, table empty → 8:8
  expect(getPhase(snap)).toBe('respotted-black.opening')
  return snap
}

describe('machine-sparring: basic', () => {
  test('frame.commence enters open-play for actor', () => {
    const snap = sendEvent(start(), { type: 'frame.commence', actor: 'A' })

    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallPotsInRun).toBe(0)
    expect(snap.context.score).toEqual({ A: 0, B: 0 })
    expect(snap.context.coloredBallsOnTable).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  test('target reached becomes winner-determined until frame.award', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [1] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [2] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [3] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [4] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [5] })

    expect(snap.context.score).toEqual({ A: 10, B: 0 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winReason).toBe('target-reached')
  })

  test('frame.award closes a winner-determined frame', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [1] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [2] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [3] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [4] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [5] })
    snap = sendEvent(snap, { type: 'frame.award', actor: 'A' })

    expect(getPhase(snap)).toBe('frame-over')
  })
})

describe('machine-sparring: foul handling', () => {
  test('foul then ball-in-hand then miss returns to opponent open-play', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })

    expect(getPhase(snap)).toBe('foul-committed.penalty-selection')
    expect(snap.context.chooser).toBe('B')
    expect(snap.context.offender).toBe('A')

    snap = sendEvent(snap, { type: 'penalty.select', actor: 'B', choice: 'ball-in-hand' })
    expect(getPhase(snap)).toBe('foul-committed.ball-in-hand')

    snap = sendEvent(snap, { type: 'miss.record', actor: 'B' })
    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallPotsInRun).toBe(0)
  })

  test('foul response play-from-position awards one point to chooser and keeps actor', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', actor: 'B', choice: 'play-from-position' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallPotsInRun).toBe(0)
  })

  test('foul response pass-position awards one point to chooser and returns actor to offender', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', actor: 'B', choice: 'pass-position' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallPotsInRun).toBe(0)
  })

  test('opponent-foul ball-in-hand cue ball and colored ball together becomes a foul', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', actor: 'B', choice: 'ball-in-hand' })

    const before = snap
    snap = sendEvent(snap, { type: 'pot.record', actor: 'B', pottedBalls: [0, 3] })

    expect(snap.context.score).toEqual({ A: 0, B: 0 })
    expect(snap.context.coloredBallsOnTable).toEqual(before.context.coloredBallsOnTable)
    expect(getPhase(snap)).toBe('foul-committed.penalty-selection')
    expect(snap.context.chooser).toBe('A')
    expect(snap.context.offender).toBe('B')
  })

  test('third consecutive cue ball pot becomes an automatic foul', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [0, 1] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [0, 2] })

    const before = snap
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [0] })

    expect(snap.context.score).toEqual(before.context.score)
    expect(snap.context.coloredBallsOnTable).toEqual(before.context.coloredBallsOnTable)
    expect(getPhase(snap)).toBe('foul-committed.penalty-selection')
    expect(snap.context.chooser).toBe('B')
    expect(snap.context.offender).toBe('A')
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
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [7] })

    expect(snap.context.score).toEqual({ A: 10, B: 8 })
    expect(snap.context.coloredBallsOnTable).toEqual([])
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winReason).toBe('respotted-black-won')
  })

  test('opening non-black pot determines opponent as winner (automatic foul)', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [0] })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winReason).toBe('automatic-foul')
    expect(snap.context.coloredBallsOnTable).toEqual([7])
  })

  test('opening cue ball plus black pot still determines opponent winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [0, 7] })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winReason).toBe('automatic-foul')
    expect(snap.context.coloredBallsOnTable).toEqual([7])
  })

  test('opening miss enters respotted-black.play for opponent', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'miss.record', actor: 'A' })

    expect(getPhase(snap)).toBe('respotted-black.play')
  })

  test('respotted-black.play pot determines winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'miss.record', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'B', pottedBalls: [7] })

    expect(snap.context.score).toEqual({ A: 8, B: 10 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winReason).toBe('respotted-black-won')
  })

  test('respotted-black.play cue ball pot determines winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'miss.record', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'B', pottedBalls: [0] })

    expect(snap.context.score).toEqual({ A: 8, B: 9 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winReason).toBe('respotted-black-won')
  })

  test('foul in respotted-black.play determines opponent as winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'miss.record', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'B' })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winReason).toBe('automatic-foul')
  })

  test('foul in respotted-black.opening determines opponent as winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winReason).toBe('automatic-foul')
  })
})

describe('machine-sparring: concede', () => {
  test('concede in open-play awards frame to opponent', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'frame.concede', actor: 'A' })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winReason).toBe('conceded')
  })

  test('concede in penalty-selection by offender awards frame to chooser', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })
    snap = sendEvent(snap, { type: 'frame.concede', actor: 'A' })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
  })
})

describe('machine-sparring: handicap', () => {
  test('handicap target lets A win at 6 after three pots', () => {
    let snap = start({ A: 6, B: 9 })
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [1] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [2] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [3] })

    expect(snap.context.score).toEqual({ A: 6, B: 0 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winReason).toBe('target-reached')
  })
})

describe('machine-sparring: continued break after winner', () => {
  test('pot.record in winner-determined continues scoring', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [1] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [2] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [3] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [4] })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [5] })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score.A).toBe(10)

    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [6] })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score.A).toBe(12)
  })
})

describe('machine-sparring: ball validation', () => {
  test('pot.record rejects colored ball not on table', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [1] })

    expect(() => sendEvent(snap, { type: 'pot.record', actor: 'A', pottedBalls: [1] })).toThrow(
      'Potted ball 1 is not on the table',
    )
  })
})
