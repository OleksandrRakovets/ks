import { expect, test } from 'bun:test'

import type { ProtocolRow } from '@ks/application'

import { presentProtocolItems } from '@/features/sparring/match/protocol/protocol-presentation'

function lane(key: string, frameIndex: number, acceptedAtLabel: string): ProtocolRow {
  return {
    kind: 'lane',
    key,
    frameIndex,
    acceptedAtIso: '',
    acceptedAtLabel,
    seat: 'A',
    action: 'miss.record',
    message: { key: 'match.protocol.lane.miss' },
    changedSeats: [],
  }
}

const frameResult = (frameIndex: number): ProtocolRow => ({
  kind: 'frame-result',
  key: `result-${frameIndex}`,
  frameIndex,
  acceptedAtIso: '',
  acceptedAtLabel: '19:20',
  winnerSeat: 'A',
  framesWonBySeat: { A: frameIndex, B: 0 },
  pointsBySeat: { A: 8, B: 0 },
  conceded: false,
  durationMs: 60_000,
})

const matchEnded = (frameIndex: number): ProtocolRow => ({
  kind: 'match-ended',
  key: 'ended',
  frameIndex,
  acceptedAtIso: '',
  acceptedAtLabel: '19:30',
  winnerSeat: 'A',
  effectiveDurationMs: 120_000,
})

const summary = (items: ReturnType<typeof presentProtocolItems>) =>
  items.map((item) =>
    item.kind === 'frame-header' ? `#${item.frameIndex}` : `${item.row.key}@${item.timeMarker ?? ''}`,
  )

test('marks each new five-minute bucket and every frame start, with headers only for frame-based games', () => {
  const rows = [
    lane('a', 1, '19:04'),
    lane('b', 1, '19:05'),
    lane('c', 1, '19:09'),
    frameResult(1),
    lane('d', 2, '19:09'),
    lane('e', 2, '19:31'),
    frameResult(2),
    matchEnded(2),
  ]

  expect(summary(presentProtocolItems(rows, true))).toEqual([
    '#1',
    'a@19:00',
    'b@19:05',
    'c@',
    'result-1@',
    '#2',
    'd@19:05',
    'e@19:30',
    'result-2@',
    'ended@',
  ])
  expect(summary(presentProtocolItems(rows.slice(0, 4).concat(matchEnded(1)), false))).toEqual([
    'a@19:00',
    'b@19:05',
    'c@',
    'result-1@',
  ])
})
