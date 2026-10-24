import { expect, test } from 'bun:test'

import type { ReadMatchResult } from '@ks/application'
import { formatPlayerRef, type MatchId, newMatchId } from '@ks/core'
import type { GameKey, StrilaGamePresentation } from '@ks/gameplay/definitions'
import { resources } from '@ks/i18n'
import { createInstance } from 'i18next'

import { presentScoreboard } from '@/features/sparring/scoreboard/presentation'

const i18n = createInstance()

await i18n.init({ lng: 'en', resources })

const t = i18n.getFixedT('en')

const matchId = newMatchId()

test('a missing or discarded match is an empty scoreboard for the same match', () => {
  expect(presentScoreboard(matchId, { ok: false, reason: 'unknown-match' }, t)).toEqual({
    kind: 'empty',
    matchId,
  })
})

test('frame games group frames won around the race, apart from the current frame points', () => {
  const values = presentScoreboard(
    matchId,
    active('free-pyramid', {
      frames: 3,
      targets: { A: 8, B: 8 },
      framesWon: { A: 1, B: 2 },
      points: { A: 5, B: 7 },
    }),
    t,
  )

  expect(values).toMatchObject({
    seq: 9,
    centre: { A: 1, B: 2, race: 3 },
    points: { A: 5, B: 7 },
    targets: null,
    balls: null,
    winnerSeat: null,
  })
})

test.each([
  ['strila-v2', { A: 9, B: 9 }, null],
  ['strila-v2', { A: 12, B: 9 }, { A: 12, B: 9 }],
  ['strila-v2', { A: 12, B: 12 }, { A: 12, B: 12 }],
  ['free-pyramid', { A: 9, B: 9 }, { A: 9, B: 9 }],
] as const)('%s targets %o are shown per seat only when not the default pair', (gameKey, targets, shown) => {
  expect(presentScoreboard(matchId, active(gameKey, { targets }), t)).toMatchObject({ targets: shown })
})

test('long pyramid is a match to points: points form the centre and an equal target is the race', () => {
  const equal = presentScoreboard(
    matchId,
    active('free-pyramid-long', { targets: { A: 60, B: 60 }, points: { A: 41, B: 17 } }),
    t,
  )

  expect(equal).toMatchObject({ points: null, targets: null, centre: { A: 41, B: 17, race: 60 } })

  const lopsided = presentScoreboard(
    matchId,
    active('free-pyramid-long', { targets: { A: 50, B: 15 }, points: { A: 41, B: 12 } }),
    t,
  )

  expect(lopsided).toMatchObject({
    points: null,
    targets: { A: 50, B: 15 },
    centre: { A: 41, B: 12, race: null },
  })
})

test('Strila mirrors ball statuses in table order and shows one per-player viewer tip', () => {
  const values = presentScoreboard(
    matchId,
    strila([
      { severity: 'warning', code: 'manual-foul-cue-ball-response' },
      { severity: 'warning', code: 'cue-ball-and-colored-is-foul' },
      { severity: 'info', code: 'respotted-black-opening' },
      { severity: 'warning', code: 'third-consecutive-cue-ball-pot', seat: 'B' },
      {
        severity: 'warning',
        code: 'last-colored-ball-pot-outcomes',
        ball: 6,
        outcomes: [{ seat: 'A', result: { type: 'winner-determined', winnerSeat: 'B' } }],
      },
      {
        severity: 'info',
        code: 'last-colored-ball-pot-outcomes',
        ball: 6,
        outcomes: [{ seat: 'B', result: { type: 'winner-determined', winnerSeat: 'B' } }],
      },
    ]),
    t,
  )

  expect(values).toMatchObject({
    balls: [
      { ball: 0, status: 'on-table' },
      { ball: 1, status: 'potted' },
      { ball: 2, status: 'potted' },
      { ball: 3, status: 'potted' },
      { ball: 4, status: 'potted' },
      { ball: 5, status: 'potted' },
      { ball: 6, status: 'object' },
      { ball: 7, status: 'potted' },
    ],
    // The frame-deciding last-ball outcome outranks B's earlier third-cue-ball warning.
    tips: { A: 'Potting pink loses the frame', B: 'Pink is the frame ball' },
  })

  const respot = presentScoreboard(
    matchId,
    strila([
      {
        severity: 'info',
        code: 'last-colored-ball-pot-outcomes',
        ball: 7,
        outcomes: [
          { seat: 'A', result: { type: 'respotted-black' } },
          { seat: 'B', result: { type: 'winner-determined', winnerSeat: 'B' } },
        ],
      },
    ]),
    t,
  )

  expect(respot).toMatchObject({
    tips: { A: 'Potting black respots the black', B: 'Black is the frame ball' },
  })

  const cueBall = presentScoreboard(
    matchId,
    strila([
      { severity: 'warning', code: 'manual-foul-cue-ball-response' },
      { severity: 'warning', code: 'third-consecutive-cue-ball-pot', seat: 'A' },
    ]),
    t,
  )

  expect(cueBall).toMatchObject({ tips: { A: 'Another cue-ball pot is a foul', B: null } })
})

test('a finished match keeps its final frame points and match score', () => {
  const read: ReadMatchResult<GameKey> = {
    ...facts('strila-v2', matchId),
    lifecycle: 'finished',
    winnerSeat: 'B',
    targets: { matchTargetFrames: 2, frameTargetPointsBySeat: { A: 9, B: 9 } },
    framesWonBySeat: { A: 1, B: 2 },
    representedFrame: { frameIndex: 3, pointsBySeat: { A: 4, B: 10 } },
    resultScores: { kind: 'frames', rows: [] },
    endedAtIso: '2026-10-24T18:00:00.000Z',
    endedAtTime: '21:00',
    endedAtDate: { year: '2026', month: '10', day: '24' },
    endedAtIsToday: true,
  }

  expect(presentScoreboard(matchId, read, t)).toMatchObject({
    winnerSeat: 'B',
    centre: { A: 1, B: 2, race: 2 },
    points: { A: 4, B: 10 },
    balls: null,
    tips: { A: null, B: null },
  })
})

function facts(gameKey: GameKey, id: MatchId) {
  return {
    ok: true as const,
    matchId: id,
    gameKey,
    latestSeq: 9,
    participants: {
      A: {
        playerRef: formatPlayerRef('gp', newMatchId()),
        displayName: 'Oleksandr',
        shortDisplayName: 'Oleksandr',
      },
      B: { playerRef: formatPlayerRef('gp', newMatchId()), displayName: 'Bohdan', shortDisplayName: 'Bohdan' },
    },
  }
}

function active(
  gameKey: GameKey,
  options: {
    frames?: number
    targets?: { A: number; B: number }
    framesWon?: { A: number; B: number }
    points?: { A: number; B: number }
  },
): ReadMatchResult<GameKey> {
  return {
    ...facts(gameKey, matchId),
    lifecycle: 'active',
    winnerSeat: null,
    targets: {
      matchTargetFrames: options.frames ?? 1,
      frameTargetPointsBySeat: options.targets ?? { A: 8, B: 8 },
    },
    framesWonBySeat: options.framesWon ?? { A: 0, B: 0 },
    representedFrame: { frameIndex: 1, pointsBySeat: options.points ?? { A: 0, B: 0 } },
    controlPhase: 'between-frames',
    controls: [],
  }
}

function strila(ruleNotes: StrilaGamePresentation['details']['ruleNotes']): ReadMatchResult<GameKey> {
  return {
    ...facts('strila-v2', matchId),
    lifecycle: 'active',
    winnerSeat: null,
    targets: { matchTargetFrames: 3, frameTargetPointsBySeat: { A: 9, B: 9 } },
    framesWonBySeat: { A: 0, B: 0 },
    representedFrame: { frameIndex: 1, pointsBySeat: { A: 6, B: 6 } },
    controlPhase: 'frame-active',
    controls: [],
    game: {
      gameKey: 'strila-v2',
      score: { A: 6, B: 6 },
      details: {
        phase: 'open-play',
        situationTitle: 'Open play',
        isBallSetVisible: true,
        isPotCommandAvailable: true,
        ballStatuses: {
          0: 'on-table',
          1: 'potted',
          2: 'potted',
          3: 'potted',
          4: 'potted',
          5: 'potted',
          6: 'object',
          7: 'potted',
        },
        pottedBallsBySeat: { A: [1, 2, 3], B: [4, 5, 7] },
        ruleNotes,
      },
    },
  }
}
