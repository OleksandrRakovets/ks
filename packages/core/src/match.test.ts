import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { MatchId } from './ids'
import { BySeatNumber, GameKey, MatchState, MatchTargets } from './match'

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

  test('continues to allow signed scores and historical syntactic game keys', () => {
    expect(v.parse(BySeatNumber, { A: -2, B: 4 })).toEqual({ A: -2, B: 4 })
    expect(v.parse(GameKey, 'historical-game')).toBe('historical-game')
  })

  test('rejects a negative per-seat match target independently', () => {
    expect(
      v.safeParse(MatchTargets, {
        frameTargetPointsBySeat: { A: -1, B: 8 },
        matchTargetFrames: 3,
      }).success,
    ).toBe(false)
  })

  test('decodes a historical syntactic game key in persisted state', () => {
    const state = v.parse(MatchState, {
      matchId: v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAV'),
      gameKey: 'historical-game',
      targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
      status: 'finished',
      currentFrameIndex: 1,
      framesWonBySeat: { A: 1, B: 0 },
      frames: [{ frameIndex: 1, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'A', winnerSeat: 'A' }],
    })

    expect(state.gameKey).toBe('historical-game')
  })
})
