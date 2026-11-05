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
  durationMs: 60_000,
})

const matchEnded = (frameIndex: number): ProtocolRow => ({
  kind: 'match-ended',
  key: 'ended',
  frameIndex,
  acceptedAtIso: '',
  acceptedAtLabel: '19:30',
  effectiveDurationMs: 120_000,
})

const summary = (items: ReturnType<typeof presentProtocolItems>) =>
  items.map((item) =>
    item.kind === 'frame-header' ? `#${item.frameIndex}` : `${item.row.key}@${item.timeMarker ?? ''}`,
  )

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

test('finished pages read oldest first, marking each new five-minute bucket and every frame start', () => {
  expect(summary(presentProtocolItems(rows, { showsFrames: true, newestFirst: false }))).toEqual([
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
  expect(
    summary(
      presentProtocolItems(rows.slice(0, 4).concat(matchEnded(1)), { showsFrames: false, newestFirst: false }),
    ),
  ).toEqual(['a@19:00', 'b@19:05', 'c@', 'result-1@'])
})

test('active pages put the latest frame and row first while keeping each frame under its header', () => {
  expect(summary(presentProtocolItems(rows.slice(0, 6), { showsFrames: true, newestFirst: true }))).toEqual([
    '#2',
    'e@19:30',
    'd@19:05',
    '#1',
    'result-1@',
    'c@19:05',
    'b@',
    'a@19:00',
  ])
})
