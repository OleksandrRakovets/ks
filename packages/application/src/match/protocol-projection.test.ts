import { expect, test } from 'bun:test'

import type { ProtocolEntry, ProtocolEntryContent } from '@ks/competition'
import { type CommandId, FixedClock, newCommandId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { presentLastCommand } from './last-command-projection'
import { renderProtocolRows } from './protocol-projection'

const clock = new FixedClock(new Date('2026-09-22T21:30:00Z'), 'Europe/Kyiv')

const start = Date.parse('2026-09-22T16:00:00Z')

/** Builds one Accepted Command's batch at `minute` after the start; entry indexes follow array order. */
function batch(
  seq: number,
  minute: number,
  contents: readonly ProtocolEntryContent[],
  commandId: CommandId = newCommandId(),
): ProtocolEntry[] {
  return contents.map((content, entryIndex) => ({
    ...content,
    acceptedSeq: seq,
    entryIndex,
    causedByCommandId: commandId,
    acceptedAt: v.parse(UnixEpochMilliseconds, start + minute * 60_000),
  }))
}

const pyramid = {
  gameKey: 'free-pyramid',
  frameIndex: 1,
  source: 'player',
  entryType: 'player-command',
} as const

const long = { ...pyramid, gameKey: 'free-pyramid-long' } as const

test('joins a Correction onto its Command and measures the next change from the restored score', () => {
  const potId = newCommandId()

  const entries = [
    ...batch(1, 0, [{ ...pyramid, seat: 'A', body: { commandType: 'frame.commence' } }]),
    ...batch(2, 1, [
      {
        ...pyramid,
        seat: 'A',
        scoreAfter: { A: 2, B: 0 },
        body: { commandType: 'pot.record', pottedBallCount: 2 },
      },
    ]),
    ...batch(
      3,
      2,
      [
        {
          ...pyramid,
          seat: 'B',
          scoreAfter: { A: 2, B: 3 },
          body: { commandType: 'pot.record', pottedBallCount: 3 },
        },
      ],
      potId,
    ),
    ...batch(4, 4, [
      {
        ...pyramid,
        entryType: 'command-corrected',
        seat: 'B',
        scoreAfter: { A: 2, B: 0 },
        body: { targetSeq: 3, targetCommandId: potId, targetEntryIndex: 0 },
      },
    ]),
    // A foul by B awards A a point: the change belongs to A although the row sits in B's lane.
    ...batch(5, 5, [
      {
        ...pyramid,
        seat: 'B',
        scoreAfter: { A: 3, B: 0 },
        body: { commandType: 'foul.commit', penalty: 'opponent-plus-one' },
      },
    ]),
  ]

  const rows = renderProtocolRows(entries, clock)

  expect(rows.map((row) => row.key)).toEqual(['protocol-1-0', 'protocol-2-0', 'protocol-3-0', 'protocol-5-0'])
  expect(rows[2]).toEqual({
    key: 'protocol-3-0',
    frameIndex: 1,
    kind: 'lane',
    seat: 'B',
    action: 'pot.record',
    message: { key: 'match.protocol.lane.pot', params: { pottedBallCount: 3 } },
    changedSeats: [],
    corrected: { acceptedAtIso: '2026-09-22T16:04:00.000Z', acceptedAtLabel: '19:04' },
    acceptedAtIso: '2026-09-22T16:02:00.000Z',
    acceptedAtLabel: '19:02',
  })
  expect(rows[3]).toMatchObject({
    seat: 'B',
    message: { key: 'match.protocol.lane.foul' },
    score: { A: 3, B: 0 },
    changedSeats: ['A'],
  })
})

test('hides system outcomes of a corrected Command while striking its player entry', () => {
  const potId = newCommandId()
  const strila = { ...pyramid, gameKey: 'strila-v2' } as const

  const entries = [
    ...batch(
      1,
      0,
      [
        {
          ...strila,
          seat: 'A',
          scoreAfter: { A: 9, B: 0 },
          body: { commandType: 'pot.record', pottedBalls: [7] },
        },
        {
          ...strila,
          source: 'system',
          entryType: 'system-note',
          seat: 'A',
          body: { systemType: 'winner-determined', reason: 'target-reached' },
        },
      ],
      potId,
    ),
    ...batch(
      2,
      1,
      [1, 0].map((targetEntryIndex) => ({
        ...strila,
        source: targetEntryIndex === 1 ? ('system' as const) : ('player' as const),
        entryType: 'command-corrected' as const,
        seat: 'A' as const,
        scoreAfter: { A: 0, B: 0 },
        body: { targetSeq: 1, targetCommandId: potId, targetEntryIndex },
      })),
    ),
  ]

  expect(renderProtocolRows(entries, clock)).toMatchObject([
    { kind: 'lane', message: { pottedBalls: [7] }, corrected: { acceptedAtLabel: '19:01' } },
  ])
})

test('replaces the award with a frame result carrying frame wins, points, and durations', () => {
  const entries = [
    ...batch(1, 0, [{ ...pyramid, seat: 'A', body: { commandType: 'frame.commence' } }]),
    ...batch(2, 10, [
      {
        ...pyramid,
        seat: 'B',
        scoreAfter: { A: 0, B: 8 },
        body: { commandType: 'pot.record', pottedBallCount: 4 },
      },
    ]),
    ...batch(3, 12, [
      { ...pyramid, seat: 'B', body: { commandType: 'frame.award' } },
      {
        ...pyramid,
        source: 'system',
        entryType: 'frame-awarded',
        seat: 'B',
        scoreAfter: { A: 0, B: 8 },
        body: { winReason: 'game-rules' },
      },
      {
        ...pyramid,
        frameIndex: 2,
        source: 'system',
        entryType: 'frame-prepared',
        seat: 'B',
        body: { targetPointsBySeat: { A: 8, B: 8 } },
      },
    ]),
    // The gap between frames does not count toward the effective match time.
    ...batch(4, 30, [{ ...pyramid, frameIndex: 2, seat: 'B', body: { commandType: 'frame.commence' } }]),
    ...batch(5, 35, [
      {
        ...pyramid,
        frameIndex: 2,
        entryType: 'frame-conceded',
        seat: 'B',
        scoreAfter: { A: 0, B: 0 },
        body: {},
      },
      {
        ...pyramid,
        frameIndex: 2,
        source: 'system',
        entryType: 'frame-awarded',
        seat: 'A',
        scoreAfter: { A: 0, B: 0 },
        body: { winReason: 'conceded' },
      },
      { ...pyramid, frameIndex: 2, source: 'system', entryType: 'match-ended', seat: 'A', body: {} },
    ]),
  ]

  const rows = renderProtocolRows(entries, clock).map((row) => {
    const { acceptedAtIso: _iso, acceptedAtLabel: _label, key: _key, ...rest } = row

    return rest
  })

  expect(rows).toEqual([
    {
      kind: 'lane',
      frameIndex: 1,
      seat: 'A',
      action: 'frame.commence',
      message: { key: 'match.protocol.lane.frame-commence' },
      changedSeats: [],
    },
    {
      kind: 'lane',
      frameIndex: 1,
      seat: 'B',
      action: 'pot.record',
      message: { key: 'match.protocol.lane.pot', params: { pottedBallCount: 4 } },
      score: { A: 0, B: 8 },
      changedSeats: ['B'],
    },
    {
      kind: 'frame-result',
      frameIndex: 1,
      winnerSeat: 'B',
      framesWonBySeat: { A: 0, B: 1 },
      pointsBySeat: { A: 0, B: 8 },
      durationMs: 12 * 60_000,
    },
    {
      kind: 'lane',
      frameIndex: 2,
      seat: 'B',
      action: 'frame.commence',
      message: { key: 'match.protocol.lane.frame-commence' },
      changedSeats: [],
    },
    {
      kind: 'lane',
      frameIndex: 2,
      seat: 'B',
      action: 'frame.concede',
      message: { key: 'match.protocol.lane.frame-conceded' },
      score: { A: 0, B: 0 },
      changedSeats: [],
    },
    {
      kind: 'frame-result',
      frameIndex: 2,
      winnerSeat: 'A',
      framesWonBySeat: { A: 1, B: 1 },
      pointsBySeat: { A: 0, B: 0 },
      durationMs: 5 * 60_000,
    },
    { kind: 'match-ended', frameIndex: 2, effectiveDurationMs: 17 * 60_000 },
  ])
})

test('presents each rack result with the time since the previous rack ended', () => {
  const rack = (rackNumber: number, A: number, B: number) =>
    ({
      ...long,
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'rack-completed', rackNumber, scoreBySeat: { A, B } },
    }) as const

  const entries = [
    ...batch(1, 0, [{ ...long, seat: 'A', body: { commandType: 'frame.commence' } }]),
    ...batch(2, 9, [
      {
        ...long,
        seat: 'A',
        scoreAfter: { A: 10, B: 4 },
        body: { commandType: 'pot.record', pottedBallCount: 2 },
      },
      rack(1, 10, 4),
    ]),
    ...batch(3, 20, [
      { ...long, seat: 'A', body: { commandType: 'frame.award' } },
      rack(2, 3, 0),
      {
        ...long,
        source: 'system',
        entryType: 'frame-awarded',
        seat: 'A',
        scoreAfter: { A: 13, B: 4 },
        body: { winReason: 'game-rules' },
      },
    ]),
  ]

  expect(renderProtocolRows(entries, clock).filter((row) => row.kind !== 'lane')).toMatchObject([
    { kind: 'rack', rackNumber: 1, score: { A: 10, B: 4 }, durationMs: 9 * 60_000 },
    { kind: 'rack', rackNumber: 2, score: { A: 3, B: 0 }, durationMs: 11 * 60_000 },
    { kind: 'frame-result', pointsBySeat: { A: 13, B: 4 }, durationMs: 20 * 60_000 },
  ])
})

test('labels every foul alike in lanes while the Last Command Bar keeps the penalty', () => {
  const entries = batch(1, 0, [
    {
      ...pyramid,
      seat: 'A',
      scoreAfter: { A: 0, B: 1 },
      body: { commandType: 'foul.commit', penalty: 'opponent-plus-one' },
    },
    {
      ...pyramid,
      gameKey: 'combined-pyramid-old',
      seat: 'A',
      scoreAfter: { A: -1, B: 1 },
      body: { commandType: 'foul.commit', penalty: 'offender-minus-one' },
    },
    {
      ...pyramid,
      gameKey: 'strila-v2',
      seat: 'B',
      scoreAfter: { A: -1, B: 3 },
      body: { commandType: 'pot.record', pottedBalls: [1, 2] },
    },
  ])

  expect(renderProtocolRows(entries, clock).map((row) => row.kind === 'lane' && row.message)).toEqual([
    { key: 'match.protocol.lane.foul' },
    { key: 'match.protocol.lane.foul' },
    { key: 'match.protocol.lane.pot-balls', pottedBalls: [1, 2] },
  ])
  expect(entries.map((entry) => presentLastCommand({ entry }, { A: 'Alice', B: 'Bob' }).message)).toEqual([
    { key: 'match.protocol.commands.foul.commit.opponent-plus-one', actor: 'Alice' },
    { key: 'match.protocol.commands.foul.commit.offender-minus-one', actor: 'Alice' },
    { key: 'match.protocol.commands.pot.record.balls', actor: 'Bob', pottedBalls: [1, 2] },
  ])
})
