import { describe, expect, test } from 'bun:test'

import { Result, Schema } from 'effect'

import { BySeatNumber, GameConfiguration, MatchTargets } from './match'
import { StrictStruct } from './valicombos'

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

  test('accepts represented integers beyond the safe range but rejects fractional and non-finite scores', () => {
    const large = Number.MAX_SAFE_INTEGER + 1

    expect(Schema.decodeUnknownSync(BySeatNumber)({ A: large, B: -large })).toEqual({ A: large, B: -large })

    for (const invalid of [0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(Result.isFailure(Schema.decodeUnknownResult(BySeatNumber)({ A: invalid, B: 4 }))).toBe(true)
    }
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

  test('closed objects reject their own excess keys without closing nested stripping objects', () => {
    const ClosedScore = StrictStruct({ score: BySeatNumber })

    expect(Schema.decodeUnknownSync(ClosedScore)({ score: { A: -2, B: 4, other: 9 } })).toEqual({
      score: { A: -2, B: 4 },
    })
    expect(
      Result.isFailure(Schema.decodeUnknownResult(ClosedScore)({ score: { A: -2, B: 4 }, other: 9 })),
    ).toBe(true)
    expect(Result.isFailure(Schema.decodeUnknownResult(ClosedScore)(null))).toBe(true)
  })
})
