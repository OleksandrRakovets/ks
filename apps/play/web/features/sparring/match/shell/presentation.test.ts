import { expect, test } from 'bun:test'

import type { MatchState } from '@ks/competition'
import { formatPlayerRef, newMatchId } from '@ks/core'
import { resources } from '@ks/i18n'
import { createInstance } from 'i18next'

import { presentResult } from '../result-presentation'
import type { ActiveProtocolData, FinishedMatchData } from '../types'
import { presentActiveSurface, presentBoardScore, presentFinishedSurface } from './presentation'

const i18n = createInstance()

await i18n.init({ lng: 'en', resources })

const t = i18n.getFixedT('en')

test.each([
  ['free-pyramid', 8],
  ['combined-pyramid', 8],
  ['combined-pyramid-old', 8],
  ['strila-v2', 9],
] as const)('finished %s shows frame wins without per-frame targets', (gameKey, defaultTarget) => {
  const state = finishedState(gameKey)

  const withTargets = (A: number, B: number) =>
    presentBoardScore({ ...state, targets: { ...state.targets, frameTargetPointsBySeat: { A, B } } })

  for (const [A, B] of [
    [defaultTarget, defaultTarget],
    [defaultTarget + 1, defaultTarget - 1],
    [120, 100],
  ])
    expect(withTargets(A, B)).toEqual({
      primary: { A: 2, B: 1 },
      targets: { A: undefined, B: undefined },
      framesWon: undefined,
      winnerSeat: 'B',
      compactScore: false,
    })
})

test('long pyramid always shows targets and points, without a frame counter for a single-frame match', () => {
  const state = finishedState('free-pyramid-long')

  const longState = {
    ...state,
    currentFrameIndex: 1,
    frames: [
      { frameIndex: 1, pointsBySeat: { A: 23, B: 30 }, breakerSeat: 'A' as const, winnerSeat: 'B' as const },
    ],
    framesWonBySeat: { A: 0, B: 1 },
    targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 30, B: 30 } },
  }

  expect(presentBoardScore(longState)).toEqual({
    primary: { A: 23, B: 30 },
    targets: { A: 30, B: 30 },
    framesWon: undefined,
    winnerSeat: 'B',
    compactScore: false,
  })
  expect(
    presentBoardScore({
      ...longState,
      targets: { ...longState.targets, frameTargetPointsBySeat: { A: 50, B: 25 } },
    }).targets,
  ).toEqual({ A: 50, B: 25 })
})

test('finishing switches points and centered frame wins to primary frame wins', () => {
  const state = finishedState('free-pyramid')

  expect(presentBoardScore({ ...state, status: 'active', winnerSeat: null })).toEqual({
    primary: { A: 3, B: 8 },
    targets: { A: 8, B: 8 },
    framesWon: { A: 2, B: 1 },
    winnerSeat: null,
    compactScore: false,
  })
  expect(presentBoardScore(state)).toEqual({
    primary: { A: 2, B: 1 },
    targets: { A: undefined, B: undefined },
    framesWon: undefined,
    winnerSeat: 'B',
    compactScore: false,
  })
})

test('control uses current frame points, including owed balls, and keeps default targets visible', () => {
  const state: MatchState = {
    ...finishedState('combined-pyramid-old'),
    status: 'active',
    winnerSeat: null,
    currentFrameIndex: 1,
    frames: [{ frameIndex: 1, pointsBySeat: { A: -2, B: 6 }, breakerSeat: 'A' }],
    framesWonBySeat: { A: 0, B: 0 },
    targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 8, B: 8 } },
  }

  expect(presentBoardScore(state)).toEqual({
    primary: { A: -2, B: 6 },
    targets: { A: 8, B: 8 },
    framesWon: undefined,
    winnerSeat: null,
    compactScore: false,
  })
})

test('a prepared match has zero points and no frame counter for a single-frame race', () => {
  const state: MatchState = {
    ...finishedState('free-pyramid'),
    status: 'active',
    winnerSeat: null,
    currentFrameIndex: 0,
    frames: [],
    framesWonBySeat: { A: 0, B: 0 },
    targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 8, B: 8 } },
  }

  expect(presentBoardScore(state)).toEqual({
    primary: { A: 0, B: 0 },
    targets: { A: 8, B: 8 },
    framesWon: undefined,
    winnerSeat: null,
    compactScore: false,
  })
})

test('uses compact scores when long-pyramid points or targets reach 100', () => {
  const state: MatchState = {
    ...finishedState('free-pyramid-long'),
    status: 'active',
    winnerSeat: null,
    currentFrameIndex: 1,
    frames: [{ frameIndex: 1, pointsBySeat: { A: 98, B: 97 }, breakerSeat: 'A' }],
    framesWonBySeat: { A: 0, B: 0 },
    targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 99, B: 99 } },
  }

  const withPoints = (A: number, B: number) =>
    presentBoardScore({
      ...state,
      frames: [{ frameIndex: 1, pointsBySeat: { A, B }, breakerSeat: 'A' }],
    })

  expect(withPoints(99, 98).compactScore).toBe(false)
  expect(withPoints(100, 98).compactScore).toBe(true)
  expect(withPoints(99, 100).compactScore).toBe(true)
  expect(
    presentBoardScore({
      ...state,
      targets: { ...state.targets, frameTargetPointsBySeat: { A: 99, B: 100 } },
    }).compactScore,
  ).toBe(true)
})

test('active Control and Protocol share rack context but show cumulative points separately from rack points', () => {
  const rack = { rackNumber: 3, scoreBySeat: { A: 2, B: 4 } }

  const data: ActiveProtocolData<'free-pyramid-long'> = {
    ok: true,
    lifecycle: 'active',
    controlPhase: 'frame-active',
    latestSeq: 12,
    protocolRows: [],
    shortGameTitle: 'Continuous Free',
    participants: participants(),
    state: {
      ...finishedState('free-pyramid-long'),
      gameKey: 'free-pyramid-long',
      status: 'active',
      winnerSeat: null,
      currentFrameIndex: 1,
      frames: [{ frameIndex: 1, pointsBySeat: { A: 23, B: 18 }, breakerSeat: 'A' }],
      framesWonBySeat: { A: 0, B: 0 },
      targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 50, B: 30 } },
    },
    game: {
      gameKey: 'free-pyramid-long',
      score: { A: 23, B: 18 },
      details: {
        phase: 'open-play',
        rackHistory: [rack],
        currentRack: rack,
        rackRollover: 14,
        ballsRemoved: 6,
        ballsOnTable: 9,
        messages: [],
        isPotCommandAvailable: true,
      },
    },
  }

  const protocol = presentActiveSurface(data, t)
  const control = presentActiveSurface({ ...data, controls: [] }, t)

  expect(control).toEqual(protocol)
  expect(protocol.header).toEqual({ title: 'Rack 3', rule: 'rerack at 14' })
  expect(protocol.board.score.primary).toEqual({ A: 23, B: 18 })
  expect(protocol.board.details).toEqual({
    kind: 'rack',
    scoreBySeat: { A: 2, B: 4 },
    tableLabel: '9 balls on table',
  })
  expect(protocol.board.mutedSeat).toBeNull()
})

test('finished Result and Protocol share winner emphasis even when the winner has fewer points', () => {
  const data = finishedData()
  const result = presentFinishedSurface(data, t)
  const protocolData = { ...data, protocolRows: [] }

  expect(presentFinishedSurface(protocolData, t)).toEqual(result)
  expect(result.board.score.primary).toEqual({ A: 0, B: 1 })
  expect(result.board.score.framesWon).toBeUndefined()
  expect(result.board.winnerLabel).toBe('Bohdan won')
  expect(result.board.mutedSeat).toBe('A')
  expect(result.board.details).toBeNull()
})

test('result rows use rack scores when supplied, with frame rows retained as the archive fallback', () => {
  const data: FinishedMatchData = {
    ...finishedData(),
    state: { ...finishedData().state, gameKey: 'free-pyramid-long' },
    gameResult: {
      gameKey: 'free-pyramid-long',
      racks: [
        { rackNumber: 1, scoreBySeat: { A: 11, B: 3 } },
        { rackNumber: 2, scoreBySeat: { A: 5, B: 9 } },
      ],
    },
  }

  expect(presentResult(data, t)).toMatchObject({
    title: 'Racks',
    rows: [
      { index: 1, score: { A: 11, B: 3 } },
      { index: 2, score: { A: 5, B: 9 } },
    ],
    finishedLabel: 'Finished today at 21:07',
  })
  expect(presentResult({ ...data, gameResult: null, endedAtIsToday: false }, t)).toMatchObject({
    title: 'Frames',
    rows: [{ index: 1, score: { A: 7, B: 2 } }],
    finishedLabel: 'Finished on 1.10.2026 at 21:07',
  })
})

function participants() {
  return {
    A: {
      playerRef: formatPlayerRef('gp', newMatchId()),
      displayName: 'Oleksandr',
      shortDisplayName: 'Oleksandr',
    },
    B: { playerRef: formatPlayerRef('gp', newMatchId()), displayName: 'Bohdan', shortDisplayName: 'Bohdan' },
  }
}

function finishedData(): FinishedMatchData {
  return {
    ok: true,
    lifecycle: 'finished',
    latestSeq: 4,
    shortGameTitle: 'Free',
    participants: participants(),
    endedAtIso: '2026-10-01T18:07:00Z',
    endedAtTime: '21:07',
    endedAtDate: { day: '1', month: '10', year: '2026' },
    endedAtIsToday: true,
    hasCustomFrameTarget: false,
    gameResult: null,
    state: {
      ...finishedState('free-pyramid'),
      currentFrameIndex: 1,
      framesWonBySeat: { A: 0, B: 1 },
      targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 8, B: 8 } },
      frames: [{ frameIndex: 1, pointsBySeat: { A: 7, B: 2 }, breakerSeat: 'A', winnerSeat: 'B' }],
    },
  }
}

function finishedState(gameKey: MatchState['gameKey']): Extract<MatchState, { status: 'finished' }> {
  return {
    matchId: newMatchId(),
    gameKey,
    status: 'finished',
    winnerSeat: 'B',
    targets: { matchTargetFrames: 3, frameTargetPointsBySeat: { A: 8, B: 8 } },
    currentFrameIndex: 2,
    framesWonBySeat: { A: 2, B: 1 },
    frames: [
      { frameIndex: 1, pointsBySeat: { A: 8, B: 2 }, breakerSeat: 'A', winnerSeat: 'A' },
      { frameIndex: 2, pointsBySeat: { A: 3, B: 8 }, breakerSeat: 'B', winnerSeat: 'B' },
    ],
  }
}
