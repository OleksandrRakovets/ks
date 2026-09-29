import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { BySeatNumber, MatchTargets } from './match'

describe('match value schemas', () => {
  test('requires positive frame and match targets', () => {
    expect(
      v.safeParse(MatchTargets, {
        frameTargetPointsBySeat: { A: 8, B: 8 },
        matchTargetFrames: 3,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(MatchTargets, {
        frameTargetPointsBySeat: { A: 0, B: 8 },
        matchTargetFrames: 3,
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(MatchTargets, {
        frameTargetPointsBySeat: { A: 8, B: 8 },
        matchTargetFrames: -1,
      }).success,
    ).toBe(false)
  })

  test('continues to allow signed scores', () => {
    expect(v.parse(BySeatNumber, { A: -2, B: 4 })).toEqual({ A: -2, B: 4 })
  })

  test('rejects a negative per-seat match target independently', () => {
    expect(
      v.safeParse(MatchTargets, {
        frameTargetPointsBySeat: { A: -1, B: 8 },
        matchTargetFrames: 3,
      }).success,
    ).toBe(false)
  })
})
