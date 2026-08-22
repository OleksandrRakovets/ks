import { describe, expect, test } from 'bun:test'

import type { BySeatNumber } from '@ks/core'
import { createActor } from 'xstate'

import { ballsOnTableFromRacks, currentRack, removedByRack, totalScore } from './calculations'
import {
  createInitialSnapshot,
  getPhase,
  LongFreePyramidSparringFrameMachine,
  type LongFreePyramidSparringFrameSnapshot,
  sendEvent,
} from './machine'

const DEFAULT_TARGET: BySeatNumber = { A: 30, B: 30 }

function start(rackRollover: 14 | 15 = 14, target: BySeatNumber = DEFAULT_TARGET): LongFreePyramidSparringFrameSnapshot {
  return createInitialSnapshot({ targetPointsBySeat: target, rackRollover })
}

describe('LongFreePyramidSparringFrameMachine: configuration', () => {
  test('rejects invalid rackRollover at machine input boundary', () => {
    // SAFETY: 13 is intentionally invalid rackRollover for direct actor construction test.
    const invalidRollover = 13 as 14
    const actor = createActor(LongFreePyramidSparringFrameMachine, {
      input: { targetPointsBySeat: DEFAULT_TARGET, rackRollover: invalidRollover },
    })
    let capturedError: unknown
    const subscription = actor.subscribe({
      error: (error) => {
        capturedError = error
      },
    })
    actor.start()
    subscription.unsubscribe()

    expect(actor.getSnapshot().status).toBe('error')
    expect(String(capturedError)).toContain('Long free pyramid requires rackRollover 14 or 15')
  })

  test('accepts rackRollover 14 and 15', () => {
    expect(createInitialSnapshot({ targetPointsBySeat: DEFAULT_TARGET, rackRollover: 14 }).context.rackRollover).toBe(14)
    expect(createInitialSnapshot({ targetPointsBySeat: DEFAULT_TARGET, rackRollover: 15 }).context.rackRollover).toBe(15)
  })
})

describe('LongFreePyramidSparringFrameMachine: initial and commence', () => {
  test('starts not-started with one empty rack', () => {
    const snap = start()
    expect(getPhase(snap)).toBe('not-started')
    expect(snap.context.racks).toEqual([{ rackNumber: 1, scoreBySeat: { A: 0, B: 0 } }])
    expect(snap.context.messages).toEqual([])
    expect(snap.context.winner).toBeNull()
  })

  test('frame.commence enters open-play', () => {
    const snap = sendEvent(start(), { type: 'frame.commence', seat: 'A' })
    expect(getPhase(snap)).toBe('open-play')
  })
})

describe('LongFreePyramidSparringFrameMachine: scoring and racks', () => {
  test('accumulates multi-rack totals', () => {
    let snap = start(14, { A: 30, B: 30 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    for (const points of [4, 4, 4, 1] as const) {
      snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points })
    }
    snap = sendEvent(snap, { type: 'pot.record', seat: 'B', points: 2 })

    expect(totalScore(snap.context.racks)).toEqual({ A: 13, B: 2 })
    expect(snap.context.racks).toEqual([
      { rackNumber: 1, scoreBySeat: { A: 13, B: 2 } },
      { rackNumber: 2, scoreBySeat: { A: 0, B: 0 } },
    ])
    expect(getPhase(snap)).toBe('open-play')
  })

  test('rolls over at rackRollover 14 by pot', () => {
    let snap = start(14, { A: 30, B: 30 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    for (const points of [4, 4, 4, 2] as const) {
      snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points })
    }

    expect(snap.context.racks).toHaveLength(2)
    expect(snap.context.messages).toEqual([{ code: 'rack-started', rackNumber: 2 }])
    expect(ballsOnTableFromRacks(snap.context.racks)).toBe(16)
    expect(removedByRack(currentRack(snap.context.racks))).toBe(0)
  })

  test('rolls over at rackRollover 15 by foul', () => {
    let snap = start(15, { A: 30, B: 30 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    for (let index = 0; index < 15; index += 1) {
      snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    }

    expect(snap.context.racks).toHaveLength(2)
    expect(snap.context.messages).toEqual([{ code: 'rack-started', rackNumber: 2 }])
    expect(totalScore(snap.context.racks)).toEqual({ A: 0, B: 15 })
  })

  test('ordinary commands clear prior rack-start messages', () => {
    let snap = start(14, { A: 30, B: 30 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    for (const points of [4, 4, 4, 2] as const) {
      snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points })
    }
    expect(snap.context.messages).toEqual([{ code: 'rack-started', rackNumber: 2 }])

    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 1 })
    expect(snap.context.messages).toEqual([])
  })

  test('rejects impossible pot beyond balls on table', () => {
    let snap = start()
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })

    expect(() =>
      // SAFETY: 5 is intentionally invalid pot points for machine rejection test.
      sendEvent(snap, { type: 'pot.record', seat: 'A', points: 5 as 4 }),
    ).toThrow('Invalid Long free pyramid event pot.record in phase open-play')
    expect(getPhase(snap)).toBe('open-play')
  })

  test('rejects foul when no balls remain on the current rack', () => {
    let snap = start(15, { A: 30, B: 30 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = LongFreePyramidSparringFrameMachine.resolveState({
      ...snap,
      value: 'open-play',
      context: {
        ...snap.context,
        racks: [{ rackNumber: 1, scoreBySeat: { A: 8, B: 8 } }],
        messages: [],
      },
    })

    expect(() => sendEvent(snap, { type: 'foul.commit', seat: 'A' })).toThrow(
      'Invalid Long free pyramid event foul.commit in phase open-play',
    )
    expect(getPhase(snap)).toBe('open-play')
  })
})

describe('LongFreePyramidSparringFrameMachine: winner flow', () => {
  test('target by pot enters winner-determined', () => {
    let snap = start(15, { A: 4, B: 4 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(snap.context.winner).toBe('A')
  })

  test('target by foul enters awaiting-award', () => {
    let snap = start(15, { A: 8, B: 1 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(getPhase(snap)).toBe('awaiting-award')
    expect(snap.context.winner).toBe('B')
    expect(totalScore(snap.context.racks)).toEqual({ A: 0, B: 1 })
  })

  test('winner may continue scoring in winner-determined', () => {
    let snap = start(15, { A: 4, B: 4 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 1 })

    expect(getPhase(snap)).toBe('winner-determined')
    expect(totalScore(snap.context.racks)).toEqual({ A: 5, B: 0 })
  })

  test('loser pots in winner-determined throw', () => {
    let snap = start(15, { A: 4, B: 4 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'B', points: 1 })).toThrow(
      'Invalid Long free pyramid event pot.record in phase winner-determined',
    )
    expect(totalScore(snap.context.racks)).toEqual({ A: 4, B: 0 })
  })

  test('fixed-winner foul enters awaiting-award without replacing winner', () => {
    let snap = start(15, { A: 4, B: 4 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(getPhase(snap)).toBe('awaiting-award')
    expect(snap.context.winner).toBe('A')
    expect(totalScore(snap.context.racks)).toEqual({ A: 4, B: 1 })
  })

  test('awaiting-award does not roll racks', () => {
    let snap = start(14, { A: 30, B: 14 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    for (let index = 0; index < 13; index += 1) {
      snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    }
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })

    expect(getPhase(snap)).toBe('awaiting-award')
    expect(snap.context.racks).toHaveLength(1)
    expect(snap.context.messages).toEqual([])
  })

  test('frame.award from winner-determined and awaiting-award closes frame', () => {
    let snap = start(15, { A: 4, B: 4 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })
    expect(getPhase(snap)).toBe('frame-over')

    snap = start(15, { A: 8, B: 1 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'foul.commit', seat: 'A' })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'B' })
    expect(getPhase(snap)).toBe('frame-over')
  })

  test('wrong-seat frame.award throws', () => {
    let snap = start(15, { A: 4, B: 4 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })

    expect(() => sendEvent(snap, { type: 'frame.award', seat: 'B' })).toThrow(
      'Invalid Long free pyramid event frame.award in phase winner-determined',
    )
    expect(getPhase(snap)).toBe('winner-determined')
  })

  test('post-terminal commands throw', () => {
    let snap = start(15, { A: 4, B: 4 })
    snap = sendEvent(snap, { type: 'frame.commence', seat: 'A' })
    snap = sendEvent(snap, { type: 'pot.record', seat: 'A', points: 4 })
    snap = sendEvent(snap, { type: 'frame.award', seat: 'A' })

    expect(() => sendEvent(snap, { type: 'pot.record', seat: 'A', points: 1 })).toThrow(
      'Invalid Long free pyramid event pot.record in phase frame-over',
    )
    expect(getPhase(snap)).toBe('frame-over')
  })
})
