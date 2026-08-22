import { describe, expect, test } from 'bun:test'

import type { BySeatNumber } from '@ks/core'

import { createInitialSnapshot, getPhase, type PyramidSparringFrameSnapshot, sendEvent } from './machine'
import { type PyramidRules, PyramidRuleSpecificsByGameKey } from './rules'

const FREE_RULES = PyramidRuleSpecificsByGameKey['free-pyramid']
const COMBINED_RULES = PyramidRuleSpecificsByGameKey['combined-pyramid']
const COMBINED_OLD_RULES = PyramidRuleSpecificsByGameKey['combined-pyramid-old']

const DEFAULT_TARGET: BySeatNumber = { A: 8, B: 8 }

function start(rules: PyramidRules = FREE_RULES, target: BySeatNumber = DEFAULT_TARGET): PyramidSparringFrameSnapshot {
  return createInitialSnapshot(rules, target)
}

describe('PyramidSparringFrameMachine: basic', () => {
  test('frame.commence enters open-play', () => {
    const snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })

    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.score).toEqual({ A: 0, B: 0 })
  })

  test('pot.record accumulates score in open-play', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 1 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', points: 2 })

    expect(snap.context.score).toEqual({ A: 1, B: 2 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('reaching target enters winner-determined with target-reached reason', () => {
    let snap = start(FREE_RULES, { A: 3, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 1 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 2 })

    expect(snap.context.score).toEqual({ A: 3, B: 0 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
    expect(snap.context.winReason).toBe('target-reached')
  })

  test('frame.award by leader closes the frame', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })

    expect(getPhase(snap)).toBe('frame-over')
  })

  test('frame.award by non-leader is ignored', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'B' })

    expect(getPhase(snap)).toBe('winner-determined')
  })

  test('continued pots in winner-determined keep accumulating', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 1 })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score).toEqual({ A: 3, B: 0 })
  })

  test('loser pots in winner-determined are ignored', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', points: 1 })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score).toEqual({ A: 2, B: 0 })
  })

  test('post-terminal commands reject', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 2 })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })
    const after = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 1 })

    expect(getPhase(after)).toBe('frame-over')
    expect(after.context.score).toEqual({ A: 2, B: 0 })
  })
})

describe('PyramidSparringFrameMachine: foul handling', () => {
  test('opponent-plus-one foul awards point to opponent', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('offender-minus-one foul subtracts from offender', () => {
    let snap = start(COMBINED_OLD_RULES)
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(snap.context.score).toEqual({ A: -1, B: 0 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('foul that brings opponent to target enters winner-determined', () => {
    let snap = start(FREE_RULES, { A: 8, B: 1 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(snap.context.score).toEqual({ A: 0, B: 1 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('B')
    expect(snap.context.winReason).toBe('target-reached')
  })

  test('invalid shot points are ignored', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: -5 })

    expect(snap.context.score).toEqual({ A: 0, B: 0 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('allowNegative=false clamps offender-minus-one foul at zero', () => {
    const clampRules: PyramidRules = {
      gameKey: 'combined-pyramid',
      allowNegative: false,
      foulPenalty: 'offender-minus-one',
      shotPointOptions: [1, 2],
    }
    let snap = start(clampRules)
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(snap.context.score).toEqual({ A: 0, B: 0 })
    expect(getPhase(snap)).toBe('open-play')
  })
})

describe('PyramidSparringFrameMachine: rules selection', () => {
  test('free-pyramid allows +4 preset', () => {
    let snap = start(FREE_RULES)
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })

    expect(snap.context.score).toEqual({ A: 4, B: 0 })
  })

  test('combined-pyramid rejects +4 preset', () => {
    let snap = start(COMBINED_RULES)
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })

    expect(snap.context.score).toEqual({ A: 0, B: 0 })
  })

  test('exhaustive rules map covers every pyramid game key', () => {
    expect(Object.keys(PyramidRuleSpecificsByGameKey).sort()).toEqual([
      'combined-pyramid',
      'combined-pyramid-old',
      'free-pyramid',
    ])
  })
})

describe('PyramidSparringFrameMachine: handicap', () => {
  test('asymmetric targets allow lower-target seat to win first', () => {
    let snap = start(FREE_RULES, { A: 3, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 1 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', points: 4 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 2 })

    expect(snap.context.score).toEqual({ A: 3, B: 4 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
  })
})
