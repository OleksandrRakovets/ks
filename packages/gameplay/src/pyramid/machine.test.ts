import { describe, expect, test } from 'bun:test'

import { type BySeatNumber, FrameOutcome } from '@ks/core'
import * as v from 'valibot'

import { createInitialSnapshot, getPhase, type PyramidFrameSnapshot, sendEvent } from './machine'
import { type PyramidRules, PyramidRuleSpecificsByGameKey } from './rules'

const FREE_RULES = PyramidRuleSpecificsByGameKey['free-pyramid']

const COMBINED_RULES = PyramidRuleSpecificsByGameKey['combined-pyramid']

const COMBINED_OLD_RULES = PyramidRuleSpecificsByGameKey['combined-pyramid-old']

const DEFAULT_TARGET: BySeatNumber = { A: 8, B: 8 }

function start(rules: PyramidRules = FREE_RULES, target: BySeatNumber = DEFAULT_TARGET): PyramidFrameSnapshot {
  return createInitialSnapshot(rules, target)
}

describe('PyramidFrameMachine: basic', () => {
  test('frame.commence enters open-play', () => {
    const snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })

    expect(getPhase(snap)).toBe('open-play')
    expect(snap.context.score).toEqual({ A: 0, B: 0 })
  })

  test('pot.record accumulates score in open-play', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 1 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBallCount: 2 })

    expect(snap.context.score).toEqual({ A: 1, B: 2 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('reaching target enters winner-determined with winner set', () => {
    let snap = start(FREE_RULES, { A: 3, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 1 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 2 })

    expect(snap.context.score).toEqual({ A: 3, B: 0 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
  })

  test('frame.award by leader closes the frame', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 2 })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })

    expect(getPhase(snap)).toBe('frame-over')
    expect(snap.output).toEqual({ winnerSeat: 'A', winReason: 'game-rules', score: { A: 2, B: 0 } })
    expect(v.is(FrameOutcome, snap.output)).toBe(true)
  })

  test('frame.award by non-leader throws', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 2 })

    expect(() => sendEvent(snap, { type: 'frame.award', seat: 'B' })).toThrow(
      'Invalid Pyramid event frame.award in phase winner-determined',
    )
    expect(getPhase(snap)).toBe('winner-determined')
  })

  test('continued pots in winner-determined accumulate into the awarded score', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 2 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 1 })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score).toEqual({ A: 3, B: 0 })

    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })
    expect(snap.output).toEqual({ winnerSeat: 'A', winReason: 'game-rules', score: { A: 3, B: 0 } })
  })

  test('loser pots in winner-determined throw', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 2 })

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBallCount: 1 })).toThrow(
      'Invalid Pyramid event pot.record in phase winner-determined',
    )
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.score).toEqual({ A: 2, B: 0 })
  })

  test('commands after frame completion throw', () => {
    let snap = start(FREE_RULES, { A: 2, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 2 })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 1 })).toThrow(
      'Invalid Pyramid event pot.record in phase frame-over',
    )
    expect(getPhase(snap)).toBe('frame-over')
    expect(snap.context.score).toEqual({ A: 2, B: 0 })
  })
})

describe('PyramidFrameMachine: foul handling', () => {
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
  })

  test('invalid pottedBallCount throws without mutating state', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: -5 })).toThrow(
      'Invalid Pyramid event pot.record in phase open-play',
    )
    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 0 })).toThrow(
      'Invalid Pyramid event pot.record in phase open-play',
    )
    expect(snap.context.score).toEqual({ A: 0, B: 0 })
    expect(getPhase(snap)).toBe('open-play')
  })

  test('owed balls from offender-minus-one are repaid by later legal pots', () => {
    let snap = start(COMBINED_OLD_RULES)
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    expect(snap.context.score).toEqual({ A: -1, B: 0 })

    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 1 })
    expect(snap.context.score).toEqual({ A: 0, B: 0 })

    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 1 })
    expect(snap.context.score).toEqual({ A: 1, B: 0 })
    expect(getPhase(snap)).toBe('open-play')
  })
})

describe('PyramidFrameMachine: rules selection', () => {
  test('free-pyramid allows +4 preset', () => {
    let snap = start(FREE_RULES)
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 4 })

    expect(snap.context.score).toEqual({ A: 4, B: 0 })
  })

  test('combined-pyramid rejects +4 preset', () => {
    let snap = start(COMBINED_RULES)
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 4 })).toThrow(
      'Invalid Pyramid event pot.record in phase open-play',
    )
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

describe('PyramidFrameMachine: handicap', () => {
  test('asymmetric targets allow lower-target seat to win first', () => {
    let snap = start(FREE_RULES, { A: 3, B: 8 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 1 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', pottedBallCount: 4 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', pottedBallCount: 2 })

    expect(snap.context.score).toEqual({ A: 3, B: 4 })
    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
  })
})
