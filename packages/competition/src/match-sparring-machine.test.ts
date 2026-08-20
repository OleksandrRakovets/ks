import { describe, expect, test } from 'bun:test'

import type { BySeatNumber, FrameOutcome, Seat } from '@ks/core'

import { createMatchActor, getMatchPhase, type MatchSparringActor, matchSparringMachine } from './match-sparring-machine'

const DEFAULT_TARGETS: BySeatNumber = { A: 9, B: 9 }

function snap(actor: MatchSparringActor) {
  return actor.getSnapshot()
}

function outcome(winnerSeat: Seat, score: BySeatNumber = winnerSeat === 'A' ? { A: 10, B: 0 } : { A: 0, B: 10 }): FrameOutcome {
  return {
    winnerSeat,
    score,
    winReason: 'target-reached',
  }
}

function setup(actor: MatchSparringActor, matchTargetFrames = 3, frameTargetPointsBySeat = DEFAULT_TARGETS) {
  actor.send({ type: 'match.setup', frameTargetPointsBySeat, matchTargetFrames })
}

function playFrame(actor: MatchSparringActor, winnerSeat: Seat, score?: BySeatNumber) {
  actor.send({ type: 'frame.start' })
  actor.send({ type: 'frame.completed', outcome: outcome(winnerSeat, score) })
}

describe('match-sparring: setup', () => {
  test('starts in idle', () => {
    const actor = createMatchActor()
    expect(getMatchPhase(snap(actor))).toBe('idle')
  })

  test('match.setup transitions to between-frames', () => {
    const actor = createMatchActor()
    setup(actor)

    expect(getMatchPhase(snap(actor))).toBe('between-frames')
    expect(snap(actor).context.matchTargetFrames).toBe(3)
    expect(snap(actor).context.frameTargetPointsBySeat).toEqual(DEFAULT_TARGETS)
  })

  test('input defaults are applied', () => {
    const actor = createMatchActor({ matchTargetFrames: 5, frameTargetPointsBySeat: { A: 12, B: 8 } })
    expect(snap(actor).context.matchTargetFrames).toBe(5)
    expect(snap(actor).context.frameTargetPointsBySeat).toEqual({ A: 12, B: 8 })
  })
})

describe('match-sparring: frame lifecycle', () => {
  test('frame.start transitions to frame-in-progress', () => {
    const actor = createMatchActor()
    setup(actor)
    actor.send({ type: 'frame.start' })

    expect(getMatchPhase(snap(actor))).toBe('frame-in-progress')
  })

  test('completed frame returns to between-frames and records outcome', () => {
    const actor = createMatchActor()
    setup(actor)
    playFrame(actor, 'A')

    expect(getMatchPhase(snap(actor))).toBe('between-frames')
    expect(snap(actor).context.framesWonBySeat).toEqual({ A: 1, B: 0 })
    expect(snap(actor).context.frames).toEqual([
      {
        frameIndex: 1,
        score: { A: 10, B: 0 },
        winnerSeat: 'A',
        winReason: 'target-reached',
      },
    ])
  })

  test('second frame starts with next frame index', () => {
    const actor = createMatchActor()
    setup(actor)
    playFrame(actor, 'A')
    actor.send({ type: 'frame.start' })

    expect(getMatchPhase(snap(actor))).toBe('frame-in-progress')
    expect(snap(actor).context.currentFrameIndex).toBe(2)
  })
})

describe('match-sparring: match target', () => {
  test('reaching match target transitions to match-point-reached, not match-over', () => {
    const actor = createMatchActor()
    setup(actor, 2)
    playFrame(actor, 'A')
    playFrame(actor, 'A')

    expect(getMatchPhase(snap(actor))).toBe('match-point-reached')
    expect(snap(actor).context.matchWinner).toBe('A')
    expect(snap(actor).context.framesWonBySeat).toEqual({ A: 2, B: 0 })
  })

  test('match with alternating frames reaches correct winner', () => {
    const actor = createMatchActor()
    setup(actor, 2)
    playFrame(actor, 'A')
    playFrame(actor, 'B')
    playFrame(actor, 'B')

    expect(getMatchPhase(snap(actor))).toBe('match-point-reached')
    expect(snap(actor).context.matchWinner).toBe('B')
    expect(snap(actor).context.framesWonBySeat).toEqual({ A: 1, B: 2 })
  })

  test('match.end before target is ignored', () => {
    const actor = createMatchActor()
    setup(actor, 3)
    playFrame(actor, 'A')
    playFrame(actor, 'A')
    actor.send({ type: 'match.end' })

    expect(getMatchPhase(snap(actor))).toBe('between-frames')
    expect(snap(actor).context.matchWinner).toBeNull()
  })

  test('match.end at 0-0 is ignored', () => {
    const actor = createMatchActor()
    setup(actor, 3)
    actor.send({ type: 'match.end' })

    expect(getMatchPhase(snap(actor))).toBe('between-frames')
    expect(snap(actor).context.matchWinner).toBeNull()
  })

  test('match.end finalizes after target is reached', () => {
    const actor = createMatchActor()
    setup(actor, 1)
    playFrame(actor, 'A')

    actor.send({ type: 'match.end' })

    expect(getMatchPhase(snap(actor))).toBe('match-over')
    expect(snap(actor).context.matchWinner).toBe('A')
  })

  test('cannot start another frame after target is reached', () => {
    const actor = createMatchActor()
    setup(actor, 1)
    playFrame(actor, 'A')

    actor.send({ type: 'frame.start' })

    expect(getMatchPhase(snap(actor))).toBe('match-point-reached')
  })
})

describe('match-sparring: handicap targets', () => {
  test('records frame outcome score from frame.completed', () => {
    const actor = createMatchActor({ frameTargetPointsBySeat: { A: 6, B: 9 }, matchTargetFrames: 3 })
    setup(actor, 3, { A: 6, B: 9 })
    playFrame(actor, 'A', { A: 6, B: 0 })

    expect(snap(actor).context.frames[0]?.score).toEqual({ A: 6, B: 0 })
    expect(snap(actor).context.framesWonBySeat.A).toBe(1)
  })
})

describe('match-sparring: machine metadata', () => {
  test('machine id is set', () => {
    expect(matchSparringMachine.id).toBe('match-sparring')
  })
})
