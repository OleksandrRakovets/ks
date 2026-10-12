import { expect, test } from 'bun:test'

import type { MatchListEntry } from '@ks/application'

import { presentMatchCard } from '@/features/sparring/matches/match-card-presentation'

type CardInput = Parameters<typeof presentMatchCard>[0]

function entry(overrides: Partial<CardInput> & Pick<CardInput, 'gameKey'>): CardInput {
  return {
    status: 'active',
    hasCustomFrameTarget: false,
    score: {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 0, B: 0 },
      winnerSeat: null,
      singleFramePointsBySeat: { A: 5, B: 3 },
      activeFrame: { frameIndex: 1, pointsBySeat: { A: 5, B: 3 } },
    } satisfies MatchListEntry['score'],
    ...overrides,
  }
}

test('single-frame short games race to frame wins like multi-frame ones', () => {
  expect(presentMatchCard(entry({ gameKey: 'free-pyramid' }))).toEqual({
    score: { A: 0, B: 0 },
    activeFrameScore: { A: 5, B: 3 },
    playerTargets: null,
    raceToWins: 1,
    frameIndex: 1,
  })
})

test('long pyramid shows points against per-player targets, even at default targets', () => {
  expect(
    presentMatchCard(
      entry({
        gameKey: 'free-pyramid-long',
        score: { ...entry({ gameKey: 'free-pyramid-long' }).score, frameTargetPointsBySeat: { A: 30, B: 30 } },
      }),
    ),
  ).toEqual({
    score: { A: 5, B: 3 },
    activeFrameScore: null,
    playerTargets: { A: 30, B: 30 },
    raceToWins: null,
    frameIndex: null,
  })
})

test('finished short games drop live details and keep the race only for custom multi-frame targets', () => {
  const finished = {
    matchTargetFrames: 3,
    frameTargetPointsBySeat: { A: 10, B: 6 },
    framesWonBySeat: { A: 3, B: 1 },
    winnerSeat: 'A',
    singleFramePointsBySeat: null,
    activeFrame: null,
  } as const

  expect(
    presentMatchCard(entry({ gameKey: 'combined-pyramid', status: 'finished', score: finished })),
  ).toMatchObject({ score: { A: 3, B: 1 }, activeFrameScore: null, raceToWins: null, frameIndex: null })
  expect(
    presentMatchCard(
      entry({ gameKey: 'combined-pyramid', status: 'finished', score: finished, hasCustomFrameTarget: true }),
    ),
  ).toMatchObject({ playerTargets: { A: 10, B: 6 }, raceToWins: 3 })
})
