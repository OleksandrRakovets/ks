import { expect, test } from 'bun:test'

import type { MatchReadFacts } from '@ks/application'
import { formatPlayerRef, newMatchId } from '@ks/core'
import { resources } from '@ks/i18n'
import { createInstance } from 'i18next'

import { presentResult } from '@/features/sparring/match/result-presentation'
import {
  presentActiveSurface,
  presentBoardScore,
  presentFinishedBoard,
} from '@/features/sparring/match/shell/presentation'
import type {
  ActiveProtocolData,
  FinishedMatchData,
  FinishedProtocolData,
} from '@/features/sparring/match/types'

const i18n = createInstance()

await i18n.init({ lng: 'en', resources })

const t = i18n.getFixedT('en')

test.each([
  ['free-pyramid', 8],
  ['combined-pyramid-old', 8],
  ['strila-v2', 9],
] as const)('finished %s shows frame wins without per-frame targets', (gameKey, defaultTarget) => {
  const data = finishedFacts(gameKey)

  for (const [A, B] of [
    [defaultTarget, defaultTarget],
    [defaultTarget + 1, defaultTarget - 1],
    [120, 100],
  ])
    expect(
      presentBoardScore({ ...data, targets: { ...data.targets, frameTargetPointsBySeat: { A, B } } }),
    ).toEqual({
      primary: { A: 3, B: 0 },
      targets: { A: undefined, B: undefined },
      framesWon: undefined,
      winnerSeat: 'A',
      compactScore: false,
    })
})

test.each([
  ['normal 8:8 target win', 8, 8],
  ['handicap 10:6 B concession at 8:3', 10, 6],
] as const)('combined pyramid %s switches shared surfaces from points to frame wins', (_scenario, A, B) => {
  const facts = {
    ...finishedFacts('combined-pyramid'),
    gameKey: 'combined-pyramid' as const,
    targets: { matchTargetFrames: 3, frameTargetPointsBySeat: { A, B } },
    gameTitle: 'Combined Pyramid',
  }

  const active: ActiveProtocolData<'combined-pyramid'> = {
    ...facts,
    lifecycle: 'active',
    winnerSeat: null,
    controlPhase: 'frame-active',
    representedFrame: { frameIndex: 2, pointsBySeat: { A: 4, B: 3 } },
    framesWonBySeat: { A: 1, B: 0 },
    protocolRows: [],
    game: {
      gameKey: 'combined-pyramid',
      score: { A: 4, B: 3 },
      details: {
        phase: 'open-play',
        situationTitle: 'Open play',
        situationSummary: 'Record shot value or foul for either player.',
        isPotCommandAvailable: true,
      },
    },
  }

  const control = presentActiveSurface({ ...active, controls: [] }, t)
  expect(presentActiveSurface(active, t)).toEqual(control)
  expect(control.board.score).toEqual({
    primary: { A: 4, B: 3 },
    targets: { A, B },
    framesWon: { A: 1, B: 0 },
    winnerSeat: null,
    compactScore: false,
  })

  const finished: FinishedMatchData<'combined-pyramid'> = {
    ...facts,
    resultScores: {
      kind: 'frames',
      rows: [
        { index: 1, score: { A, B: 2 } },
        { index: 2, score: { A, B: 1 } },
        { index: 3, score: { A: 8, B: 3 } },
      ],
    },
    endedAtIso: '2026-10-01T18:07:00Z',
    endedAtTime: '21:07',
    endedAtDate: { day: '1', month: '10', year: '2026' },
    endedAtIsToday: true,
  }

  const protocol: FinishedProtocolData<'combined-pyramid'> = { ...facts, protocolRows: [] }
  const result = presentFinishedBoard(finished, t)
  expect(presentFinishedBoard(protocol, t)).toEqual(result)
  expect(result.score).toEqual({
    primary: { A: 3, B: 0 },
    targets: { A: undefined, B: undefined },
    framesWon: undefined,
    winnerSeat: 'A',
    compactScore: false,
  })
  expect(result.winnerLabel).toBe('Oleksandr won')
  expect(result.mutedSeat).toBe('B')
  expect(result.caption).toBe('Combined Pyramid · race to 3 wins')
  expect(presentResult(finished, t).rows).toEqual([
    { index: 1, score: { A, B: 2 } },
    { index: 2, score: { A, B: 1 } },
    { index: 3, score: { A: 8, B: 3 } },
  ])
})

test('control shows owed balls and keeps default targets visible', () => {
  expect(
    presentBoardScore({
      ...finishedFacts('combined-pyramid-old'),
      lifecycle: 'active',
      winnerSeat: null,
      representedFrame: { frameIndex: 1, pointsBySeat: { A: -2, B: 6 } },
      framesWonBySeat: { A: 0, B: 0 },
      targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 8, B: 8 } },
    }),
  ).toEqual({
    primary: { A: -2, B: 6 },
    targets: { A: 8, B: 8 },
    framesWon: undefined,
    winnerSeat: null,
    compactScore: false,
  })
})

test('a no-frame read falls back to zero points and displayed first frame', () => {
  const data: ActiveProtocolData = {
    ...finishedFacts('free-pyramid'),
    lifecycle: 'active',
    winnerSeat: null,
    controlPhase: 'between-frames',
    gameTitle: 'Free Pyramid',
    representedFrame: null,
    framesWonBySeat: { A: 0, B: 0 },
    targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A: 8, B: 8 } },
    protocolRows: [],
  }

  expect(presentBoardScore(data)).toEqual({
    primary: { A: 0, B: 0 },
    targets: { A: 8, B: 8 },
    framesWon: undefined,
    winnerSeat: null,
    compactScore: false,
  })
  expect(presentActiveSurface(data, t).header.title).toBe('Frame\u00a01')
})

test.each(['points A', 'points B', 'target A', 'target B', 'frame wins A', 'frame wins B'] as const)(
  'compact typography changes at 100 in visible %s',
  (field) => {
    for (const value of [99, 100]) {
      const data = finishedFacts(field.startsWith('frame wins') ? 'free-pyramid' : 'free-pyramid-long')
      const seat = field.endsWith('A') ? 'A' : 'B'
      const scores = { A: 23, B: 30, [seat]: value }

      if (field.startsWith('points')) data.representedFrame = { frameIndex: 1, pointsBySeat: scores }
      else if (field.startsWith('target')) data.targets = { ...data.targets, frameTargetPointsBySeat: scores }
      else data.framesWonBySeat = scores
      expect(presentBoardScore(data).compactScore).toBe(value === 100)
    }
  },
)

test.each([
  ['normal 30:30', 30, 30],
  ['handicap 50:30', 50, 30],
] as const)(
  'long pyramid %s Control and Protocol separate cumulative and current-rack points',
  (_scenario, A, B) => {
    const rack = { rackNumber: 2, scoreBySeat: { A: 4, B: 3 } }

    const data: ActiveProtocolData<'free-pyramid-long'> = {
      ...finishedFacts('free-pyramid-long'),
      gameKey: 'free-pyramid-long',
      lifecycle: 'active',
      winnerSeat: null,
      controlPhase: 'frame-active',
      latestSeq: 12,
      protocolRows: [],
      gameTitle: 'Continuous Free Pyramid',
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 11, B: 10 } },
      framesWonBySeat: { A: 0, B: 0 },
      targets: { matchTargetFrames: 1, frameTargetPointsBySeat: { A, B } },
      game: {
        gameKey: 'free-pyramid-long',
        score: { A: 11, B: 10 },
        details: {
          phase: 'open-play',
          rackHistory: [{ rackNumber: 1, scoreBySeat: { A: 7, B: 7 } }, rack],
          currentRack: rack,
          rackRollover: 14,
          ballsRemoved: 7,
          ballsOnTable: 9,
          messages: [],
          isPotCommandAvailable: true,
        },
      },
    }

    const protocol = presentActiveSurface(data, t)
    expect(presentActiveSurface({ ...data, controls: [] }, t)).toEqual(protocol)
    expect(protocol.header).toEqual({ title: 'Rack 2', rule: 'rerack at 14' })
    expect(protocol.board.score).toEqual({
      primary: { A: 11, B: 10 },
      targets: { A, B },
      framesWon: undefined,
      winnerSeat: null,
      compactScore: false,
    })
    expect(protocol.board.details).toEqual({
      kind: 'rack',
      scoreBySeat: { A: 4, B: 3 },
      tableLabel: '9 balls on table',
    })
    expect(protocol.board.mutedSeat).toBeNull()
  },
)

test.each([
  ['normal 30:30 target win', { A: 30, B: 30 }, { A: 23, B: 30 }],
  ['handicap 50:30 A concession at 4:3', { A: 50, B: 30 }, { A: 4, B: 3 }],
] as const)(
  'long pyramid %s Result and Protocol retain points/targets and highlight B',
  (_scenario, targets, points) => {
    const shared = {
      ...finishedFacts('free-pyramid-long'),
      gameKey: 'free-pyramid-long' as const,
      winnerSeat: 'B' as const,
      framesWonBySeat: { A: 0, B: 1 },
      representedFrame: { frameIndex: 1, pointsBySeat: points },
      targets: { matchTargetFrames: 1, frameTargetPointsBySeat: targets },
      gameTitle: 'Continuous Free Pyramid',
    }

    const data: FinishedMatchData<'free-pyramid-long'> = {
      ...shared,
      resultScores: {
        kind: 'racks',
        rows:
          targets.A === 30
            ? [
                { index: 1, score: { A: 7, B: 7 } },
                { index: 2, score: { A: 7, B: 7 } },
                { index: 3, score: { A: 7, B: 7 } },
                { index: 4, score: { A: 2, B: 9 } },
              ]
            : [{ index: 1, score: { A: 4, B: 3 } }],
      },
      endedAtIso: '2026-10-01T18:07:00Z',
      endedAtTime: '21:07',
      endedAtDate: { day: '1', month: '10', year: '2026' },
      endedAtIsToday: true,
    }

    const protocol: FinishedProtocolData<'free-pyramid-long'> = { ...shared, protocolRows: [] }
    const result = presentFinishedBoard(data, t)

    expect(presentFinishedBoard(protocol, t)).toEqual(result)
    expect(result.score).toEqual({
      primary: points,
      targets,
      framesWon: undefined,
      winnerSeat: 'B',
      compactScore: false,
    })
    expect(result.winnerLabel).toBe('Bohdan won')
    expect(result.mutedSeat).toBe('A')
    expect(result.details).toBeNull()
    expect(result.caption).toBe('Continuous Free Pyramid')

    if (targets.A === 30)
      expect(presentResult(data, t).rows).toEqual([
        { index: 1, score: { A: 7, B: 7 } },
        { index: 2, score: { A: 7, B: 7 } },
        { index: 3, score: { A: 7, B: 7 } },
        { index: 4, score: { A: 2, B: 9 } },
      ])
    else expect(presentResult(data, t).rows).toEqual([{ index: 1, score: { A: 4, B: 3 } }])
  },
)

test.each(['racks', 'frames'] as const)(
  'result translates %s and finished copy without extracting history',
  (kind) => {
    const data: FinishedMatchData = {
      ...finishedFacts('free-pyramid-long'),
      gameTitle: 'Continuous Free Pyramid',
      resultScores: { kind, rows: [{ index: 4, score: { A: 11, B: 3 } }] },
      endedAtIso: '2026-10-01T18:07:00Z',
      endedAtTime: '21:07',
      endedAtDate: { day: '1', month: '10', year: '2026' },
      endedAtIsToday: true,
    }

    expect(presentResult(data, t)).toMatchObject({
      title: kind === 'racks' ? 'Racks' : 'Frames',
      rows: [{ index: 4, score: { A: 11, B: 3 } }],
      finishedLabel: 'Finished today at 21:07',
    })
    expect(presentResult({ ...data, endedAtIsToday: false }, t).finishedLabel).toBe(
      'Finished on 1.10.2026 at 21:07',
    )
  },
)

function finishedFacts(gameKey: MatchReadFacts['gameKey']) {
  return {
    ok: true as const,
    matchId: newMatchId(),
    gameKey,
    latestSeq: 4,
    participants: {
      A: {
        playerRef: formatPlayerRef('gp', newMatchId()),
        displayName: 'Oleksandr',
        shortDisplayName: 'Oleksandr',
      },
      B: { playerRef: formatPlayerRef('gp', newMatchId()), displayName: 'Bohdan', shortDisplayName: 'Bohdan' },
    },
    lifecycle: 'finished' as const,
    winnerSeat: 'A' as const,
    targets: { matchTargetFrames: 3, frameTargetPointsBySeat: { A: 8, B: 8 } },
    representedFrame: { frameIndex: 3, pointsBySeat: { A: 8, B: 3 } },
    framesWonBySeat: { A: 3, B: 0 },
  }
}
