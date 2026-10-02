import { describe, expect, test } from 'bun:test'

import { Schema } from 'effect'

import { BySeatNumber, GameConfiguration, MatchTargets } from './match'

describe('match value schemas', () => {
  test('requires positive frame and match targets', () => {
    expect(
      Schema.is(MatchTargets)({
        frameTargetPointsBySeat: { A: 8, B: 8 },
        matchTargetFrames: 3,
      }),
    ).toBe(true)
    expect(
      Schema.is(MatchTargets)({
        frameTargetPointsBySeat: { A: 0, B: 8 },
        matchTargetFrames: 3,
      }),
    ).toBe(false)
    expect(
      Schema.is(MatchTargets)({
        frameTargetPointsBySeat: { A: 8, B: 8 },
        matchTargetFrames: -1,
      }),
    ).toBe(false)
  })

  test('continues to allow signed scores', () => {
    expect(Schema.decodeUnknownSync(BySeatNumber)({ A: -2, B: 4 })).toEqual({ A: -2, B: 4 })
  })

  test('rejects a negative per-seat match target independently', () => {
    expect(
      Schema.is(MatchTargets)({
        frameTargetPointsBySeat: { A: -1, B: 8 },
        matchTargetFrames: 3,
      }),
    ).toBe(false)
  })

  test('preserves omitted and explicitly undefined optional values while stripping unknown fields', () => {
    const omitted = Schema.decodeUnknownSync(GameConfiguration)({})
    const present = Schema.decodeUnknownSync(GameConfiguration)({ rackRollover: undefined, other: 1 })

    expect(omitted).toEqual({})
    expect(omitted).not.toHaveProperty('rackRollover')
    expect(present).toHaveProperty('rackRollover', undefined)
    expect(present).not.toHaveProperty('other')
    expect(Schema.is(GameConfiguration)({ rackRollover: null })).toBe(false)
  })
})
