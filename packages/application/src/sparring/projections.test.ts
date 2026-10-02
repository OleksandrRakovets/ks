import { describe, expect, test } from 'bun:test'

import type { MatchState } from '@ks/competition'
import { FixedClock } from '@ks/core'

import { presentFinishedMatch, projectMatchFacts } from './projections'
import { createdAt, participants, state, transfer } from './sparring.fixtures'

const clock = new FixedClock(new Date(createdAt), 'Europe/Kyiv')

const endedAt = clock.instantPresentation(transfer.endedAt)

const now = clock.nowPresentation()

describe('sparring Match projections', () => {
  test('selects the indexed awarded frame and preserves Owed Balls', () => {
    const current: typeof MatchState.Type = {
      ...state,
      gameKey: 'combined-pyramid-old',
      currentFrameIndex: 2,
      framesWonBySeat: { A: 1, B: 1 },
      frames: [
        { frameIndex: 2, pointsBySeat: { A: -2, B: 6 }, breakerSeat: 'B', winnerSeat: 'B' },
        { frameIndex: 1, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'A', winnerSeat: 'A' },
      ],
    }

    expect(projectMatchFacts(current, 7, participants)).toMatchObject({
      gameKey: 'combined-pyramid-old',
      latestSeq: 7,
      framesWonBySeat: { A: 1, B: 1 },
      representedFrame: { frameIndex: 2, pointsBySeat: { A: -2, B: 6 } },
    })
  })

  test('retains prepared and winner-determined points, then selects the zero-score next frame', () => {
    const winnerDetermined: typeof MatchState.Type = {
      ...state,
      targets: { ...state.targets, matchTargetFrames: 2 },
      frames: [{ frameIndex: 1, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'A' }],
    }

    const nextFrame: typeof MatchState.Type = {
      ...winnerDetermined,
      currentFrameIndex: 2,
      framesWonBySeat: { A: 1, B: 0 },
      frames: [
        { frameIndex: 1, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'A', winnerSeat: 'A' },
        { frameIndex: 2, pointsBySeat: { A: 0, B: 0 }, breakerSeat: 'B' },
      ],
    }

    expect(projectMatchFacts(state, 0, participants).representedFrame).toEqual({
      frameIndex: 1,
      pointsBySeat: { A: 0, B: 0 },
    })
    expect(projectMatchFacts(winnerDetermined, 5, participants).representedFrame).toEqual({
      frameIndex: 1,
      pointsBySeat: { A: 8, B: 3 },
    })
    expect(projectMatchFacts(nextFrame, 6, participants).representedFrame).toEqual({
      frameIndex: 2,
      pointsBySeat: { A: 0, B: 0 },
    })
  })

  test('returns null for index zero but throws for a missing positive index', () => {
    expect(
      projectMatchFacts({ ...state, currentFrameIndex: 0, frames: [] }, 0, participants).representedFrame,
    ).toBeNull()
    expect(() => projectMatchFacts({ ...state, currentFrameIndex: 2, frames: [] }, 0, participants)).toThrow(
      'Missing represented Match frame',
    )
    expect(() => projectMatchFacts({ ...state, currentFrameIndex: 2 }, 0, participants)).toThrow(
      'Missing represented Match frame',
    )
  })

  test('preserves ordinary Result row indexes and source order without inferring the winner', () => {
    const finalState: Extract<typeof MatchState.Type, { status: 'finished' }> = {
      ...transfer.finalState,
      framesWonBySeat: { A: 2, B: 0 },
      frames: [
        { frameIndex: 2, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'B', winnerSeat: 'A' },
        { frameIndex: 1, pointsBySeat: { A: 4, B: 7 }, breakerSeat: 'A', winnerSeat: 'A' },
      ],
    }

    const result = presentFinishedMatch(
      { state: finalState, latestSeq: 9, endedAt: transfer.endedAt, gameResult: null },
      participants,
      endedAt,
      now,
    )

    expect(result).toMatchObject({
      winnerSeat: 'A',
      framesWonBySeat: { A: 2, B: 0 },
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 4, B: 7 } },
    })
    expect(result.resultScores).toEqual({
      kind: 'frames',
      rows: [
        { index: 2, score: { A: 8, B: 3 } },
        { index: 1, score: { A: 4, B: 7 } },
      ],
    })
  })

  test('preserves long rack rows, empty rollover, cumulative points and optional rematch configuration', () => {
    const finalState: Extract<typeof MatchState.Type, { status: 'finished' }> = {
      ...transfer.finalState,
      gameKey: 'free-pyramid-long',
      winnerSeat: 'B',
      gameConfiguration: { rackRollover: 14 },
      targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 50, B: 30 } },
      framesWonBySeat: { A: 0, B: 1 },
      frames: [{ frameIndex: 1, breakerSeat: 'A', pointsBySeat: { A: 16, B: 12 }, winnerSeat: 'B' }],
    }

    const match = {
      state: finalState,
      latestSeq: 11,
      endedAt: transfer.endedAt,
      gameResult: {
        gameKey: 'free-pyramid-long' as const,
        racks: [
          { rackNumber: 1, scoreBySeat: { A: 11, B: 3 } },
          { rackNumber: 2, scoreBySeat: { A: 5, B: 9 } },
          { rackNumber: 3, scoreBySeat: { A: 0, B: 0 } },
        ],
      },
    }

    const result = presentFinishedMatch(match, participants, endedAt, now)
    expect(result).toMatchObject({
      gameKey: 'free-pyramid-long',
      winnerSeat: 'B',
      targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 50, B: 30 } },
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 16, B: 12 } },
      gameConfiguration: { rackRollover: 14 },
    })
    expect(result.resultScores).toEqual({
      kind: 'racks',
      rows: [
        { index: 1, score: { A: 11, B: 3 } },
        { index: 2, score: { A: 5, B: 9 } },
        { index: 3, score: { A: 0, B: 0 } },
      ],
    })

    const { gameConfiguration: _configuration, ...withoutConfiguration } = finalState
    expect(
      presentFinishedMatch({ ...match, state: withoutConfiguration }, participants, endedAt, now),
    ).not.toHaveProperty('gameConfiguration')
    expect(
      presentFinishedMatch({ ...match, gameResult: null }, participants, endedAt, now).resultScores,
    ).toEqual({ kind: 'frames', rows: [{ index: 1, score: { A: 16, B: 12 } }] })
  })
})
