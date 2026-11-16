import { expect, test } from 'bun:test'

import type { ReadMatchResult } from '@ks/application'
import { formatPlayerRef, type MatchId, newMatchId } from '@ks/core'
import type { GameKey, StrilaGamePresentation } from '@ks/gameplay/definitions'
import { resources } from '@ks/i18n'
import { createInstance } from 'i18next'

import { presentScoreboard } from '@/features/scoreboard/present/present'

const i18n = createInstance()

await i18n.init({ lng: 'en', resources })

const t = i18n.getFixedT('en')

const matchId = newMatchId()

function present(read: ReadMatchResult<GameKey>, names: 'full' | 'short' = 'full') {
  return presentScoreboard({ gameKey: read.ok ? read.gameKey : 'strila-v2', matchId, read, names }, t)
}

test('a missing or discarded match is an empty scoreboard for the same match', () => {
  expect(present({ ok: false, reason: 'unknown-match' })).toMatchObject({ kind: 'empty', matchId })
})

test('the artwork size depends on the game: Strila has a ball row, long pyramid 3-digit points', () => {
  const size = (gameKey: GameKey) =>
    presentScoreboard({ gameKey, matchId, read: { ok: false, reason: 'unknown-match' }, names: 'full' }, t)
      .size

  expect(size('strila-v2')).toEqual({ ballRow: true, pointChars: 2, centre: { kind: 'frames', digits: 2 } })
  expect(size('free-pyramid-long')).toEqual({
    ballRow: false,
    pointChars: 3,
    centre: { kind: 'target', digits: 3 },
  })
  // Old-rules points can go negative, so the points boxes fit a minus sign.
  expect(size('combined-pyramid-old')).toMatchObject({ pointChars: 3 })
})

test('short names replace the first name with its initial', () => {
  expect(present(active('free-pyramid', {}), 'short')).toMatchObject({
    names: { A: 'O. Rakovets', B: 'B. Kovalchuk' },
  })
})

test('frame games group frames won around the race, apart from the current frame points', () => {
  const values = present(
    active('free-pyramid', {
      frames: 3,
      targets: { A: 8, B: 8 },
      framesWon: { A: 1, B: 2 },
      points: { A: 5, B: 7 },
    }),
  )

  expect(values).toMatchObject({
    seq: 9,
    centre: { kind: 'frames', A: 1, B: 2, race: 3 },
    points: { A: '5', B: '7' },
    targets: null,
    balls: null,
    winnerSeat: null,
  })
})

test('negative points use a minus sign, not a hyphen', () => {
  expect(present(active('combined-pyramid-old', { points: { A: -2, B: 3 } }))).toMatchObject({
    points: { A: '\u22122', B: '3' },
  })
})

test.each([
  ['strila-v2', { A: 9, B: 9 }, null],
  ['strila-v2', { A: 12, B: 9 }, { A: 12, B: 9 }],
  ['strila-v2', { A: 12, B: 12 }, { A: 12, B: 12 }],
  ['free-pyramid', { A: 9, B: 9 }, { A: 9, B: 9 }],
] as const)('%s targets %o are shown per seat only when not the default pair', (gameKey, targets, shown) => {
  const values = present(active(gameKey, { targets }))

  expect(values).toMatchObject({ targets: shown })
  // A frames centre labels the targets beneath it.
  expect(values.kind === 'match' && values.targets !== null && values.targets.label !== null).toBe(
    shown !== null,
  )
})

test('long pyramid shows its score as points, an equal target in the centre, lopsided targets beneath', () => {
  const equal = present(active('free-pyramid-long', { targets: { A: 30, B: 30 }, points: { A: 41, B: 17 } }))

  expect(equal).toMatchObject({
    points: { A: '41', B: '17' },
    targets: null,
    centre: { kind: 'target', target: 30 },
  })

  const lopsided = present(
    active('free-pyramid-long', { targets: { A: 50, B: 15 }, points: { A: 41, B: 12 } }),
  )

  expect(lopsided).toMatchObject({
    points: { A: '41', B: '12' },
    targets: { A: 50, B: 15, label: null },
    centre: { kind: 'separator' },
  })
})

test('Strila mirrors ball statuses in table order and shows one per-player viewer tip', () => {
  const values = present(
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
  )

  // Ball statuses mirror the table; operator instructions and seatless notes stay off stream.
  expect(values.kind === 'match' ? values.balls?.find(({ ball }) => ball === 6)?.status : null).toBe('object')
  expect(values).toMatchObject({
    // The frame-deciding last-ball outcome outranks B's earlier third-cue-ball warning.
    tips: { A: { kind: 'pot-loses-frame', ball: 6 }, B: { kind: 'frame-ball', ball: 6 } },
  })

  const respot = present(
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
  )

  expect(respot).toMatchObject({
    tips: { A: { kind: 'pot-ties-frame', ball: 7 }, B: { kind: 'frame-ball', ball: 7 } },
  })

  const cueBall = present(
    strila([
      { severity: 'warning', code: 'manual-foul-cue-ball-response' },
      { severity: 'warning', code: 'third-consecutive-cue-ball-pot', seat: 'A' },
    ]),
  )

  expect(cueBall).toMatchObject({ tips: { A: { kind: 'third-cue-ball-pot' }, B: null } })
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

  expect(present(read)).toMatchObject({
    winnerSeat: 'B',
    centre: { kind: 'frames', A: 1, B: 2, race: 2 },
    points: { A: '4', B: '10' },
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
        displayName: 'Oleksandr Rakovets',
        shortDisplayName: 'O. Rakovets',
      },
      B: {
        playerRef: formatPlayerRef('gp', newMatchId()),
        displayName: 'Bohdan Kovalchuk',
        shortDisplayName: 'B. Kovalchuk',
      },
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
