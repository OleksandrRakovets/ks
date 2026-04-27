import { describe, expect, test } from 'bun:test'

import { StrilaMeta } from '@ks/gameplay'

import { createMatchActor, getMatchPhase, matchSparringMachine, type MatchSparringActor } from './match-sparring-machine'

function snap(actor: MatchSparringActor) {
  return actor.getSnapshot()
}

function playFrame(actor: MatchSparringActor, winner: 'A' | 'B') {
  actor.send({ type: 'frame.start' })
  actor.send({ type: 'frame.commence', actor: winner })
  actor.send({ type: 'pot.record', actor: winner, pottedBalls: [1] })
  actor.send({ type: 'pot.record', actor: winner, pottedBalls: [2] })
  actor.send({ type: 'pot.record', actor: winner, pottedBalls: [3] })
  actor.send({ type: 'pot.record', actor: winner, pottedBalls: [4] })
  actor.send({ type: 'pot.record', actor: winner, pottedBalls: [5] })
  actor.send({ type: 'frame.award', actor: winner })
}

describe('match-sparring: setup', () => {
  test('starts in idle', () => {
    const actor = createMatchActor()
    expect(getMatchPhase(snap(actor))).toBe('idle')
  })

  test('match.setup transitions to between-frames', () => {
    const actor = createMatchActor()
    actor.send({ type: 'match.setup', frameTargetPointsBySeat: StrilaMeta.defaultTargetPoints, matchTargetFrames: 3 })

    expect(getMatchPhase(snap(actor))).toBe('between-frames')
    expect(snap(actor).context.matchTargetFrames).toBe(3)
    expect(snap(actor).context.frameTargetPointsBySeat).toEqual(StrilaMeta.defaultTargetPoints)
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
    actor.send({ type: 'match.setup', frameTargetPointsBySeat: StrilaMeta.defaultTargetPoints, matchTargetFrames: 3 })
    actor.send({ type: 'frame.start' })

    expect(getMatchPhase(snap(actor))).toBe('frame-in-progress')
  })

  test('completed frame returns to between-frames and records result', () => {
    const actor = createMatchActor()
    actor.send({ type: 'match.setup', frameTargetPointsBySeat: StrilaMeta.defaultTargetPoints, matchTargetFrames: 3 })
    playFrame(actor, 'A')

    expect(getMatchPhase(snap(actor))).toBe('between-frames')
    expect(snap(actor).context.framesWonBySeat).toEqual({ A: 1, B: 0 })
    expect(snap(actor).context.frames).toHaveLength(1)
    expect(snap(actor).context.frames[0]?.winner).toBe('A')
    expect(snap(actor).context.frames[0]?.score).toEqual({ A: 10, B: 0 })
  })

  test('second frame starts with fresh child state', () => {
    const actor = createMatchActor()
    actor.send({ type: 'match.setup', frameTargetPointsBySeat: StrilaMeta.defaultTargetPoints, matchTargetFrames: 3 })
    playFrame(actor, 'A')
    actor.send({ type: 'frame.start' })

    expect(getMatchPhase(snap(actor))).toBe('frame-in-progress')
    expect(snap(actor).context.currentFrameIndex).toBe(2)
  })
})

describe('match-sparring: match target', () => {
  test('reaching match target transitions to match-over', () => {
    const actor = createMatchActor()
    actor.send({ type: 'match.setup', frameTargetPointsBySeat: StrilaMeta.defaultTargetPoints, matchTargetFrames: 2 })
    playFrame(actor, 'A')
    playFrame(actor, 'A')

    expect(getMatchPhase(snap(actor))).toBe('match-over')
    expect(snap(actor).context.matchWinner).toBe('A')
    expect(snap(actor).context.framesWonBySeat).toEqual({ A: 2, B: 0 })
  })

  test('match with alternating frames reaches correct winner', () => {
    const actor = createMatchActor()
    actor.send({ type: 'match.setup', frameTargetPointsBySeat: StrilaMeta.defaultTargetPoints, matchTargetFrames: 2 })
    playFrame(actor, 'A')
    playFrame(actor, 'B')
    playFrame(actor, 'B')

    expect(getMatchPhase(snap(actor))).toBe('match-over')
    expect(snap(actor).context.matchWinner).toBe('B')
    expect(snap(actor).context.framesWonBySeat).toEqual({ A: 1, B: 2 })
  })

  test('explicit match.end in between-frames transitions to match-over', () => {
    const actor = createMatchActor()
    actor.send({ type: 'match.setup', frameTargetPointsBySeat: StrilaMeta.defaultTargetPoints, matchTargetFrames: 3 })
    playFrame(actor, 'A')
    playFrame(actor, 'A')
    actor.send({ type: 'match.end' })

    expect(getMatchPhase(snap(actor))).toBe('match-over')
  })
})

describe('match-sparring: handicap targets', () => {
  test('A wins frame at 6 pts with handicap target', () => {
    const actor = createMatchActor({ frameTargetPointsBySeat: { A: 6, B: 9 }, matchTargetFrames: 3 })
    actor.send({ type: 'match.setup', frameTargetPointsBySeat: { A: 6, B: 9 }, matchTargetFrames: 3 })
    actor.send({ type: 'frame.start' })
    actor.send({ type: 'frame.commence', actor: 'A' })
    actor.send({ type: 'pot.record', actor: 'A', pottedBalls: [1] })
    actor.send({ type: 'pot.record', actor: 'A', pottedBalls: [2] })
    actor.send({ type: 'pot.record', actor: 'A', pottedBalls: [3] })
    actor.send({ type: 'frame.award', actor: 'A' })

    expect(snap(actor).context.frames[0]?.score).toEqual({ A: 6, B: 0 })
    expect(snap(actor).context.framesWonBySeat.A).toBe(1)
  })
})

describe('match-sparring: machine metadata', () => {
  test('machine id is set', () => {
    expect(matchSparringMachine.id).toBe('match-sparring')
  })
})
