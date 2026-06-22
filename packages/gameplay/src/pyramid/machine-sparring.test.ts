import { describe, expect, test } from 'bun:test'

import type { BySeatNumber } from '@ks/core'

import { createInitialSnapshot, getPhase, sendEvent, type PyramidRules, type PyramidSparringSnapshot } from './machine-sparring'

const STANDARD_RULES: PyramidRules = {
  allowNegative: false,
  foulPenalty: 'opponent-plus-one',
}

const NEGATIVE_OFFENDER_RULES: PyramidRules = {
  allowNegative: true,
  foulPenalty: 'offender-minus-one',
}

const DEFAULT_TARGET: BySeatNumber = { A: 8, B: 8 }

function start(rules: PyramidRules = STANDARD_RULES, target: BySeatNumber = DEFAULT_TARGET): PyramidSparringSnapshot {
  return createInitialSnapshot(rules, target)
}

describe('pyramid machine-sparring: basic', () => {
  test('frame.commence enters open-play', () => {
    const snap = sendEvent(start(), { type: 'frame.commence', actor: 'A' })

    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.score).toEqual({ A: 0, B: 0 })
  })

  test('pot.record accumulates score in open-play', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 1 })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'B', points: 2 })

    expect(snap.context.score).toEqual({ A: 1, B: 2 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('reaching target enters winner-determined with target-reached reason', () => {
    let snap = start(STANDARD_RULES, { A: 3, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 3 })

    expect(snap.context.score).toEqual({ A: 3, B: 0 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winReason).toBe('target-reached')
  })

  test('frame.award by leader closes the frame', () => {
    let snap = start(STANDARD_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'frame.award', actor: 'A' })

    expect(getPhase(snap)).toBe('frame-over')
  })

  test('frame.award by non-leader is ignored', () => {
    let snap = start(STANDARD_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'frame.award', actor: 'B' })

    expect(getPhase(snap)).toBe('winner-determined')
  })

  test('continued pots in winner-determined keep accumulating', () => {
    let snap = start(STANDARD_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 1 })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score).toEqual({ A: 3, B: 0 })
  })

  test('loser pots in winner-determined are ignored', () => {
    let snap = start(STANDARD_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'B', points: 1 })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score).toEqual({ A: 2, B: 0 })
  })
})

describe('pyramid machine-sparring: foul handling', () => {
  test('opponent-plus-one foul awards point to opponent', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('offender-minus-one foul subtracts from offender', () => {
    let snap = start(NEGATIVE_OFFENDER_RULES)
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })

    expect(snap.context.score).toEqual({ A: -1, B: 0 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('foul that brings opponent to target enters winner-determined', () => {
    let snap = start(STANDARD_RULES, { A: 8, B: 1 })
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', actor: 'A' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winReason).toBe('target-reached')
  })

  test('non-negative rules clamp pot at zero', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: -5 })

    expect(snap.context.score).toEqual({ A: 0, B: 0 })
  })
})

describe('pyramid machine-sparring: handicap', () => {
  test('asymmetric targets allow lower-target seat to win first', () => {
    let snap = start(STANDARD_RULES, { A: 3, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', actor: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 1 })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'B', points: 5 })
    snap = sendEvent(snap, { type: 'pot.record', actor: 'A', points: 2 })

    expect(snap.context.score).toEqual({ A: 3, B: 5 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
  })
})
