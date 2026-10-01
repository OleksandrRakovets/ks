import { expect, test } from 'bun:test'

import type { ProtocolEntry } from '@ks/competition'
import { FixedClock, newCommandId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { presentLastCommand } from './last-command-projection'
import { type ProtocolMessage, renderProtocolRows } from './protocol-projection'

const clock = new FixedClock(new Date('2026-09-22T21:30:00Z'), 'Europe/Kyiv')

const entry = {
  gameKey: 'strila-v2',
  acceptedSeq: 1,
  entryIndex: 0,
  causedByCommandId: newCommandId(),
  acceptedAt: v.parse(UnixEpochMilliseconds, Date.parse('2026-09-22T21:15:00Z')),
  frameIndex: 1,
  source: 'system' as const,
  entryType: 'frame-prepared',
  seat: 'A' as const,
  body: { targetPointsBySeat: { A: 9, B: 9 } },
} satisfies ProtocolEntry

test('adapts normalized Protocol entries directly', () => {
  const row = renderProtocolRows([entry], { A: 'Alice', B: 'Bob' }, clock)[0]
  expect(row).toMatchObject({
    key: 'protocol-1-0',
    acceptedAtIso: '2026-09-22T21:15:00.000Z',
    acceptedAtLabel: '00:15',
    message: { actor: 'Alice', params: { frameIndex: '1' } },
  })
})

test('renders the dedicated table-cleared winner message', () => {
  const row = renderProtocolRows(
    [
      {
        ...entry,
        entryType: 'system-note',
        body: { systemType: 'winner-determined', reason: 'table-cleared' },
      },
    ],
    { A: 'Alice', B: 'Bob' },
    clock,
  )[0]

  expect(row?.message.key).toBe('match.protocol.system.winner-determined.table-cleared')
})

test('attributes the respotted-black opening selection to the chosen player', () => {
  const row = renderProtocolRows(
    [
      {
        ...entry,
        source: 'player',
        entryType: 'player-command',
        seat: 'B',
        body: { commandType: 'respotted-black.opening.select' },
      },
    ],
    { A: 'Alice', B: 'Bob' },
    clock,
  )[0]

  expect(row?.message).toEqual({
    key: 'match.protocol.commands.respotted-black.opening.select',
    actor: 'Bob',
  })
})

test('distinguishes Strila ball selections from Pyramid counts in Protocol and last-command messages', () => {
  const entries: ProtocolEntry[] = [
    {
      ...entry,
      source: 'player',
      entryType: 'player-command',
      body: { commandType: 'pot.record', pottedBalls: [0, 3] },
    },
    {
      ...entry,
      gameKey: 'free-pyramid',
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      body: { commandType: 'pot.record', pottedBallCount: 2 },
    },
    {
      ...entry,
      gameKey: 'free-pyramid-long',
      source: 'player',
      entryType: 'player-command',
      body: { commandType: 'pot.record', pottedBallCount: 4 },
    },
  ]

  const expected: ProtocolMessage[] = [
    { key: 'match.protocol.commands.pot.record.balls', actor: 'Alice', pottedBalls: [0, 3] },
    {
      key: 'match.protocol.commands.pot.record.pottedBallCount',
      actor: 'Bob',
      params: { pottedBallCount: '+2' },
    },
    {
      key: 'match.protocol.commands.pot.record.pottedBallCount',
      actor: 'Alice',
      params: { pottedBallCount: '+4' },
    },
  ]

  const names = { A: 'Alice', B: 'Bob' }

  expect(renderProtocolRows(entries, names, clock).map((row) => row.message)).toEqual(expected)
  expect(entries.map((entry) => presentLastCommand({ entry }, names).message)).toEqual(expected)
})

test('dispatches default, opponent and offender foul messages from their typed bodies', () => {
  const entries: ProtocolEntry[] = [
    { ...entry, source: 'player', entryType: 'player-command', body: { commandType: 'foul.commit' } },
    {
      ...entry,
      gameKey: 'free-pyramid',
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      body: { commandType: 'foul.commit', penalty: 'opponent-plus-one' },
    },
    {
      ...entry,
      gameKey: 'combined-pyramid-old',
      source: 'player',
      entryType: 'player-command',
      body: { commandType: 'foul.commit', penalty: 'offender-minus-one' },
    },
  ]

  expect(renderProtocolRows(entries, { A: 'Alice', B: 'Bob' }, clock).map((row) => row.message)).toEqual([
    { key: 'match.protocol.commands.foul.commit.default', actor: 'Alice' },
    { key: 'match.protocol.commands.foul.commit.opponent-plus-one', actor: 'Bob' },
    { key: 'match.protocol.commands.foul.commit.offender-minus-one', actor: 'Alice' },
  ])
})

test('renders the selected Strila penalty without falling back to a default message', () => {
  const entries: ProtocolEntry[] = [
    {
      ...entry,
      source: 'player',
      entryType: 'player-command',
      body: { commandType: 'penalty.select', choice: 'play-from-position' },
    },
    {
      ...entry,
      source: 'player',
      entryType: 'player-command',
      seat: 'B',
      body: { commandType: 'penalty.select', choice: 'pass-position' },
    },
    {
      ...entry,
      source: 'player',
      entryType: 'player-command',
      body: { commandType: 'penalty.select', choice: 'ball-in-hand' },
    },
  ]

  expect(renderProtocolRows(entries, { A: 'Alice', B: 'Bob' }, clock).map((row) => row.message)).toEqual([
    { key: 'match.protocol.commands.penalty.select.play-from-position', actor: 'Alice' },
    { key: 'match.protocol.commands.penalty.select.pass-position', actor: 'Bob' },
    { key: 'match.protocol.commands.penalty.select.ball-in-hand', actor: 'Alice' },
  ])
})
