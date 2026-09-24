import { describe, expect, test } from 'bun:test'

import { type BySeatNumber, FrameOutcome, type Seat } from '@ks/core'
import * as v from 'valibot'

import { type StrilaCommand, StrilaMeta } from './definitions'
import { createInitialSnapshot, getPhase, sendEvent, type StrilaSparringFrameSnapshot } from './machine'

function start(targetPointsBySeat?: BySeatNumber): StrilaSparringFrameSnapshot {
  return createInitialSnapshot(targetPointsBySeat ?? StrilaMeta.defaultTargetPoints)
}

// A:6, B:8, only ball 7 left → A pots 7 → 8:8, table empty → respotted-black opening selection
function reachRespottedBlackSelection(): StrilaSparringFrameSnapshot {
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
  expect(getPhase(snap)).toBe('respotted-black.opening-selection')

  return snap
}

function reachRespottedBlack(openingSeat: Seat = 'A'): StrilaSparringFrameSnapshot {
  return sendEvent(reachRespottedBlackSelection(), {
    type: 'respotted-black.opening.select',
    seat: openingSeat,
  })
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
    expect(snap.output).toEqual({ winnerSeat: 'A', winReason: 'game-rules', score: { A: 10, B: 0 } })
    expect(v.is(FrameOutcome, snap.output)).toBe(true)
  })
})

describe('machine-sparring: empty table', () => {
  const cases: readonly {
    name: string
    targets?: BySeatNumber
    commands: readonly StrilaCommand[]
    score: BySeatNumber
    winner: Seat | null
    reason: 'table-cleared' | 'target-reached' | null
  }[] = [
    {
      name: 'final shooter wins 8:6',
      commands: [
        { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3] },
        { type: 'pot.record', seat: 'B', pottedBalls: [4, 5, 6] },
        { type: 'pot.record', seat: 'A', pottedBalls: [7] },
      ],
      score: { A: 8, B: 6 },
      winner: 'A',
      reason: 'table-cleared',
    },
    {
      name: 'non-shooting B wins 7:8',
      commands: [
        { type: 'pot.record', seat: 'B', pottedBalls: [1, 2, 3, 4] },
        { type: 'pot.record', seat: 'A', pottedBalls: [0, 5, 6] },
        { type: 'pot.record', seat: 'A', pottedBalls: [7] },
      ],
      score: { A: 7, B: 8 },
      winner: 'B',
      reason: 'table-cleared',
    },
    {
      name: 'multiple final colors are scored together',
      commands: [
        { type: 'pot.record', seat: 'A', pottedBalls: [1, 2] },
        { type: 'pot.record', seat: 'B', pottedBalls: [3, 4, 5] },
        { type: 'pot.record', seat: 'A', pottedBalls: [6, 7] },
      ],
      score: { A: 8, B: 6 },
      winner: 'A',
      reason: 'table-cleared',
    },
    {
      name: 'cue point on final shot changes a loss into a tie',
      commands: [
        { type: 'pot.record', seat: 'B', pottedBalls: [1, 2, 3, 4] },
        { type: 'pot.record', seat: 'A', pottedBalls: [0, 5, 6] },
        { type: 'pot.record', seat: 'A', pottedBalls: [0, 7] },
      ],
      score: { A: 8, B: 8 },
      winner: null,
      reason: null,
    },
    {
      name: '9:9 below both targets triggers respotted black',
      targets: { A: 12, B: 12 },
      commands: [
        { type: 'pot.record', seat: 'A', pottedBalls: [0, 1, 2, 3] },
        { type: 'pot.record', seat: 'B', pottedBalls: [0, 4, 5, 6] },
        { type: 'pot.record', seat: 'B', pottedBalls: [0] },
        { type: 'foul.commit', seat: 'A' },
        { type: 'penalty.select', seat: 'B', choice: 'play-from-position' },
        { type: 'pot.record', seat: 'A', pottedBalls: [7] },
      ],
      score: { A: 9, B: 9 },
      winner: null,
      reason: null,
    },
    {
      name: 'target wins before a higher opponent score',
      targets: { A: 6, B: 9 },
      commands: [
        { type: 'pot.record', seat: 'A', pottedBalls: [1, 2] },
        { type: 'pot.record', seat: 'B', pottedBalls: [3, 4, 5, 6] },
        { type: 'pot.record', seat: 'A', pottedBalls: [7] },
      ],
      score: { A: 6, B: 8 },
      winner: 'A',
      reason: 'target-reached',
    },
    {
      name: 'target wins before an empty-table tie',
      targets: { A: 8, B: 9 },
      commands: [
        { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3] },
        { type: 'pot.record', seat: 'B', pottedBalls: [0, 4, 5, 6] },
        { type: 'pot.record', seat: 'B', pottedBalls: [0] },
        { type: 'pot.record', seat: 'A', pottedBalls: [7] },
      ],
      score: { A: 8, B: 8 },
      winner: 'A',
      reason: 'target-reached',
    },
  ]

  for (const scenario of cases) {
    test(scenario.name, () => {
      let snap = sendEvent(start(scenario.targets), { type: 'frame.commence', seat: 'A' })

      for (const command of scenario.commands) snap = sendEvent(snap, command)
      expect(snap.context.score).toEqual(scenario.score)
      expect(snap.context.winner).toBe(scenario.winner)
      expect(snap.context.winnerDeterminationReason).toBe(scenario.reason)
      expect(getPhase(snap)).toBe(
        scenario.winner === null ? 'respotted-black.opening-selection' : 'winner-determined',
      )
      expect(snap.context.coloredBallsOnTable).toEqual(scenario.winner === null ? [7] : [])
    })
  }

  test.each([false, true])('post-foul color-only final pot resolves the table (tie: %s)', (tie) => {
    let snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [4, 5, 6] })

    if (tie) {
      snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0] })
      snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0] })
    }

    snap = sendEvent(snap, { type: 'foul.commit', seat: 'B' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'A', choice: 'ball-in-hand' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [7] })
    expect(snap.context.score).toEqual({ A: 8, B: tie ? 8 : 6 })
    expect(getPhase(snap)).toBe(tie ? 'respotted-black.opening-selection' : 'winner-determined')
    expect(snap.context.winner).toBe(tie ? null : 'A')
    expect(snap.context.coloredBallsOnTable).toEqual(tie ? [7] : [])
  })

  test.each(['third-cue', 'ball-in-hand'] as const)(
    '%s foul takes precedence over a final scoring shot',
    (kind) => {
      let snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
      snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3] })
      snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [4, 5, 6] })

      if (kind === 'third-cue') {
        snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
        snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
      } else {
        snap = sendEvent(snap, { type: 'foul.commit', seat: 'B' })
        snap = sendEvent(snap, { type: 'penalty.select', seat: 'A', choice: 'ball-in-hand' })
      }

      const before = snap.context
      snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0, 7] })
      expect(getPhase(snap)).toBe('foul-committed.ball-in-hand')
      expect(snap.context.score).toEqual(before.score)
      expect(snap.context.pottedBallsBySeat).toEqual(before.pottedBallsBySeat)
      expect(snap.context.coloredBallsOnTable).toEqual([7])
      expect(snap.context.winner).toBeNull()
      expect(snap.context.foulOffender).toBeNull()
      expect(() =>
        sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'play-from-position' }),
      ).toThrow('Invalid Strila event')
    },
  )

  test('table-cleared winner can only award, preserving the below-target score', () => {
    let snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [1, 2, 3, 4] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [5, 6, 7] })
    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0] })).toThrow(
      'Invalid Strila event',
    )
    expect(() => sendEvent(snap, { type: 'frame.award', seat: 'A' })).toThrow('Invalid Strila event')
    snap = sendEvent(snap, { type: 'frame.award', seat: 'B' })
    expect(getPhase(snap)).toBe('frame-over')
    expect(snap.output).toEqual({ winnerSeat: 'B', score: { A: 6, B: 8 }, winReason: 'game-rules' })
    expect(v.is(FrameOutcome, snap.output)).toBe(true)
  })
})

describe('machine-sparring: foul handling', () => {
  test('first two post-foul cue-ball pots build a new streak and the third is an automatic foul', () => {
    let snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' })

    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0] })
    expect(snap.context.cueBallSerialPots).toEqual({ seat: 'B', count: 1 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0] })
    expect(snap.context.cueBallSerialPots).toEqual({ seat: 'B', count: 2 })

    const beforeThird = snap.context
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0] })
    expect(getPhase(snap)).toBe('foul-committed.ball-in-hand')
    expect(snap.context.score).toEqual(beforeThird.score)
    expect(snap.context.pottedBallsBySeat).toEqual(beforeThird.pottedBallsBySeat)
    expect(snap.context.cueBallSerialPots).toBeNull()
  })

  test.each(['A', 'B'] as const)('a %s miss clears the streak without changing table state', (missSeat) => {
    let snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
    expect(snap.context.cueBallSerialPots).toEqual({ seat: 'A', count: 2 })
    const beforeMiss = snap.context

    snap = sendEvent(snap, { type: 'miss.record', seat: missSeat })
    expect(snap.context.score).toEqual(beforeMiss.score)
    expect(snap.context.coloredBallsOnTable).toEqual(beforeMiss.coloredBallsOnTable)
    expect(snap.context.pottedBallsBySeat).toEqual(beforeMiss.pottedBallsBySeat)
    expect(snap.context.cueBallSerialPots).toBeNull()

    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
    expect(snap.context.cueBallSerialPots).toEqual({ seat: 'A', count: 1 })
  })

  test('mixed pots advance the cue-ball streak while color-only pots reset it', () => {
    let snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0, 1] })
    expect(snap.context.cueBallSerialPots).toEqual({ seat: 'A', count: 2 })

    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [2] })
    expect(snap.context.cueBallSerialPots).toBeNull()
  })

  test.each(['play-from-position', 'pass-position'] as const)(
    '%s retains the foul-entry streak reset',
    (choice) => {
      let snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
      snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
      snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
      expect(snap.context.cueBallSerialPots).toBeNull()

      snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice })
      expect(snap.context.cueBallSerialPots).toBeNull()

      if (choice === 'pass-position') {
        snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })
        expect(snap.context.cueBallSerialPots).toEqual({ seat: 'A', count: 1 })
      }
    },
  )

  test.each(['play-from-position', 'pass-position'] as const)(
    '%s bonus reaching the target determines the chooser as winner',
    (choice) => {
      const target = choice === 'play-from-position' ? 9 : 6
      let snap = sendEvent(start({ A: 9, B: target }), { type: 'frame.commence', seat: 'A' })
      snap = sendEvent(snap, {
        type: 'pot.record',
        seat: 'B',
        pottedBalls: target === 9 ? [1, 2, 3, 4] : [0, 1, 2],
      })
      snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
      snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice })

      expect(getPhase(snap)).toBe('winner-determined')
      expect(snap.context.score).toEqual({ A: 0, B: target })
      expect(snap.context.winner).toBe('B')
      expect(snap.context.winnerDeterminationReason).toBe('target-reached')
      expect(snap.context.foulOffender).toBeNull()
      expect(snap.context.cueBallSerialPots).toBeNull()
      snap = sendEvent(snap, { type: 'frame.award', seat: 'B' })
      expect(snap.output).toEqual({ winnerSeat: 'B', score: { A: 0, B: target }, winReason: 'game-rules' })
    },
  )

  test('only the opponent of the foul offender may choose the penalty', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(() => sendEvent(snap, { type: 'penalty.select', seat: 'A', choice: 'ball-in-hand' })).toThrow(
      'Invalid Strila event',
    )
    expect(() => sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' })).not.toThrow()
  })

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

  test('foul response play-from-position awards one point to chooser and returns to open play', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'play-from-position' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallSerialPots).toBeNull()
  })

  test('foul response pass-position awards one point to chooser and returns to open play', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'pass-position' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.cueBallSerialPots).toBeNull()
  })

  test('opponent-foul ball-in-hand cue ball and colored ball together remains ball in hand', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' })

    const before = snap
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [0, 3] })

    expect(snap.context.score).toEqual({ A: 0, B: 0 })
    expect(snap.context.coloredBallsOnTable).toEqual(before.context.coloredBallsOnTable)
    expect(snap.context.pottedBallsBySeat).toEqual(before.context.pottedBallsBySeat)
    expect(snap.context.cueBallSerialPots).toBeNull()
    expect(getPhase(snap)).toBe('foul-committed.ball-in-hand')
    expect(snap.context.foulOffender).toBeNull()
    expect(() => sendEvent(snap, { type: 'penalty.select', seat: 'A', choice: 'play-from-position' })).toThrow(
      'Invalid Strila event',
    )
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
    expect(snap.context.pottedBallsBySeat).toEqual(before.context.pottedBallsBySeat)
    expect(snap.context.cueBallSerialPots).toBeNull()
    expect(getPhase(snap)).toBe('foul-committed.ball-in-hand')
    expect(snap.context.foulOffender).toBeNull()
  })
})

describe('machine-sparring: respotted black', () => {
  test('entering respotted black clears a cue-ball streak created by the tying shot', () => {
    let snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2] })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [3, 4, 5, 6] })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'B' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'A', choice: 'play-from-position' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0, 7] })

    expect(snap.context.score).toEqual({ A: 8, B: 8 })
    expect(getPhase(snap)).toBe('respotted-black.opening-selection')
    expect(snap.context.cueBallSerialPots).toBeNull()
    expect(snap.context.respottedBlackOpeningSeat).toBeNull()
  })

  test('selecting the respotted-black opener records the chosen seat', () => {
    const waiting = reachRespottedBlackSelection()

    expect(() => sendEvent(waiting, { type: 'pot.record', seat: 'A', pottedBalls: [7] })).toThrow(
      'Invalid Strila event pot.record in phase respotted-black.opening-selection',
    )

    const snap = sendEvent(waiting, { type: 'respotted-black.opening.select', seat: 'B' })

    expect(snap.context.score).toEqual({ A: 8, B: 8 })
    expect(snap.context.coloredBallsOnTable).toEqual([7])
    expect(snap.context.respottedBlackOpeningSeat).toBe('B')
    expect(getPhase(snap)).toBe('respotted-black.opening')
  })

  test('only the selected player may take the respotted-black opening shot', () => {
    const snap = reachRespottedBlack('B')

    expect(() => sendEvent(snap, { type: 'miss.record', seat: 'A' })).toThrow(
      'Invalid Strila event miss.record in phase respotted-black.opening',
    )
    expect(() => sendEvent(snap, { type: 'foul.commit', seat: 'A' })).toThrow(
      'Invalid Strila event foul.commit in phase respotted-black.opening',
    )
    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [7] })).toThrow(
      'Invalid Strila event pot.record in phase respotted-black.opening',
    )
    expect(() => sendEvent(snap, { type: 'miss.record', seat: 'B' })).not.toThrow()
  })

  test('opening black pot determines winner', () => {
    let snap = reachRespottedBlack()
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [7] })

    expect(snap.context.score).toEqual({ A: 10, B: 8 })
    expect(snap.context.coloredBallsOnTable).toEqual([])
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winnerDeterminationReason).toBe('respotted-black-won')
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })
    expect(snap.output).toEqual({ winnerSeat: 'A', score: { A: 10, B: 8 }, winReason: 'game-rules' })
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
    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [7] })).toThrow(
      'Invalid Strila event pot.record in phase winner-determined',
    )
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })
    expect(snap.output).toEqual({ winnerSeat: 'A', score: { A: 8, B: 8 }, winReason: 'game-rules' })
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
  test('pot.record in winner-determined continues scoring for winner', () => {
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

    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [7] })
    expect(snap.context.score.A).toBe(14)
    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [0] })).toThrow(
      'Invalid Strila event pot.record in phase winner-determined',
    )
  })

  test('bonus target win does not permit continued scoring', () => {
    let snap = start({ A: 1, B: 9 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'B' })
    snap = sendEvent(snap, { type: 'penalty.select', seat: 'A', choice: 'play-from-position' })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1] })).toThrow(
      'Invalid Strila event pot.record in phase winner-determined',
    )
  })

  test('loser pot in winner-determined throws', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4, 5] })

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBalls: [6] })).toThrow(
      'Invalid Strila event pot.record in phase winner-determined',
    )
    expect(snap.context.score).toEqual({ A: 10, B: 0 })
  })

  test('wrong-seat frame.award in winner-determined throws', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4, 5] })

    expect(() => sendEvent(snap, { type: 'frame.award', seat: 'B' })).toThrow(
      'Invalid Strila event frame.award in phase winner-determined',
    )
    expect(getPhase(snap)).toBe('winner-determined')
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
      'Invalid Strila event',
    )
  })
})
