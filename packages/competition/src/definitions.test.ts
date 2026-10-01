import { describe, expect, test } from 'bun:test'

import { MatchId, newMatchId } from '@ks/core'
import * as v from 'valibot'

import {
  buildMatchConfig,
  CreateMatchRequest,
  MatchScoreProjection,
  MatchState,
  projectMatchScore,
} from './definitions'

const request = v.parse(CreateMatchRequest, {
  gameKey: 'strila-v2',
  targets: {
    frameTargetPointsBySeat: { A: 8, B: 8 },
    matchTargetFrames: 3,
  },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: 'gp_01HX0000000000000000000000' },
    { seat: 'B', playerRef: 'gp_01HX0000000000000000000001' },
  ],
})

describe('match creation helpers', () => {
  test('builds validated match config without storage dependencies', () => {
    const matchId = newMatchId()
    const config = buildMatchConfig(matchId, request)

    expect(config).toEqual({
      matchId,
      gameKey: 'strila-v2',
      targets: request.targets,
      firstBreakerSeat: 'A',
    })
    expect(config).not.toHaveProperty('gameConfiguration')
  })

  test('requires and preserves long free pyramid game configuration', () => {
    expect(
      v.safeParse(CreateMatchRequest, {
        ...request,
        gameKey: 'free-pyramid-long',
        targets: { ...request.targets, matchTargetFrames: 1 },
      }).success,
    ).toBe(false)

    const longRequest = v.parse(CreateMatchRequest, {
      ...request,
      gameKey: 'free-pyramid-long',
      targets: { ...request.targets, matchTargetFrames: 1 },
      gameConfiguration: { rackRollover: 14 },
    })

    expect(
      v.safeParse(CreateMatchRequest, {
        ...longRequest,
        targets: { ...longRequest.targets, matchTargetFrames: 2 },
      }).success,
    ).toBe(false)

    const matchId = newMatchId()

    expect(buildMatchConfig(matchId, longRequest)).toEqual({
      matchId,
      gameKey: 'free-pyramid-long',
      targets: longRequest.targets,
      firstBreakerSeat: 'A',
      gameConfiguration: { rackRollover: 14 },
    })
  })

  test('projects only an unfinished current Frame as active', () => {
    const base = {
      matchId: v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAV'),
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 7 }, matchTargetFrames: 3 },
      status: 'active' as const,
      winnerSeat: null,
      currentFrameIndex: 2,
      framesWonBySeat: { A: 1, B: 0 },
      frames: [
        { frameIndex: 1, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'A' as const, winnerSeat: 'A' as const },
        { frameIndex: 2, pointsBySeat: { A: 2, B: 5 }, breakerSeat: 'B' as const },
      ],
    }

    expect(projectMatchScore(v.parse(MatchState, base))).toEqual({
      matchTargetFrames: 3,
      frameTargetPointsBySeat: { A: 8, B: 7 },
      framesWonBySeat: { A: 1, B: 0 },
      winnerSeat: null,
      singleFramePointsBySeat: null,
      activeFrame: { frameIndex: 2, pointsBySeat: { A: 2, B: 5 } },
    })
    expect(
      projectMatchScore(
        v.parse(MatchState, {
          ...base,
          currentFrameIndex: 1,
          frames: base.frames.slice(0, 1),
        }),
      ).activeFrame,
    ).toBeNull()
    expect(
      projectMatchScore(
        v.parse(MatchState, {
          ...base,
          status: 'finished',
          winnerSeat: 'A',
          framesWonBySeat: { A: 3, B: 0 },
        }),
      ).activeFrame,
    ).toBeNull()

    expect(
      projectMatchScore(
        v.parse(MatchState, {
          ...base,
          targets: { ...base.targets, matchTargetFrames: 1 },
          status: 'finished',
          winnerSeat: 'A',
          currentFrameIndex: 1,
          framesWonBySeat: { A: 1, B: 0 },
          frames: base.frames.slice(0, 1),
        }),
      ).singleFramePointsBySeat,
    ).toEqual({ A: 8, B: 3 })
  })

  test.each(['A', 'B'] as const)(
    'preserves authoritative winner %s rather than the frame-score leader',
    (winnerSeat) => {
      const state = v.parse(MatchState, {
        matchId: newMatchId(),
        gameKey: 'free-pyramid',
        targets: request.targets,
        status: 'finished',
        winnerSeat,
        currentFrameIndex: 1,
        framesWonBySeat: winnerSeat === 'A' ? { A: 0, B: 2 } : { A: 2, B: 0 },
        frames: [{ frameIndex: 1, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'A', winnerSeat: 'B' }],
      })

      const score = projectMatchScore(state)
      expect(score.winnerSeat).toBe(winnerSeat)
      expect(v.parse(MatchState, JSON.parse(JSON.stringify(state)))).toEqual(state)
      expect(v.parse(MatchScoreProjection, JSON.parse(JSON.stringify(score)))).toEqual(score)
      expect(v.safeParse(MatchState, { ...state, winnerSeat: null }).success).toBe(false)
      expect(v.safeParse(MatchState, { ...state, status: 'active' }).success).toBe(false)
      expect(v.safeParse(MatchState, { ...state, winnerSeat: undefined }).success).toBe(false)
      expect(v.safeParse(MatchScoreProjection, { ...score, winnerSeat: undefined }).success).toBe(false)
    },
  )
})
