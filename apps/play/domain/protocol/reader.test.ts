import { describe, expect, test } from 'bun:test'

import { ClientIdSchema, FactIdSchema, MatchIdSchema, type ClientFact, type StoredFact } from '@ks/core'
import * as v from 'valibot'

import {
  deriveProtocolRows,
  prepareProtocolRowsForArchive,
  ProtocolArchiveRowsSchema,
  ProtocolArchiveSchema,
  renderProtocolRows,
} from './reader'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const clientId = v.parse(ClientIdSchema, 'server0000')

function stored(seq: number, fact: Omit<ClientFact, 'at' | 'clientId' | 'clientSeq' | 'factId' | 'matchId'>): StoredFact {
  return {
    matchId,
    clientId,
    clientSeq: 0,
    at: 1000 + seq,
    factId: v.parse(FactIdSchema, `01ARZ3NDEKTSV4RRFFQ69G5FA${seq}`),
    receivedAt: 2000 + seq,
    seq,
    ...fact,
  } as StoredFact
}

describe('protocol reader', () => {
  test('derives lifecycle and protocol-entry rows in write order', () => {
    const rows = prepareProtocolRowsForArchive([
      stored(1, {
        type: 'frame.started',
        payload: { frameIndex: 1, gameKey: 'strila-v2', targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' },
      }),
      stored(2, {
        type: 'game.command',
        payload: {
          frameIndex: 1,
          gameKey: 'strila-v2',
          commandType: 'pot.record',
          command: { seat: 'A', pottedBalls: [7] },
          protocolEntries: [
            {
              source: 'player',
              entryType: 'player-command',
              seat: 'A',
              scoreAfter: { A: 1, B: 0 },
              body: { commandType: 'pot.record', pottedBalls: [7] },
            },
          ],
        },
      }),
      stored(3, {
        type: 'match.ended',
        payload: { winnerSeat: 'A' },
      }),
    ])

    expect(rows.map((row) => row.rowNo)).toEqual([1, 2, 3])
    expect(rows.map((row) => row.body)).toEqual([
      { systemType: 'frame-started', frameIndex: 1 },
      { commandType: 'pot.record', pottedBalls: [7] },
      { systemType: 'match-ended' },
    ])
    expect(rows[0]?.seat).toBe('A')
  })

  test('hides frame.completed immediately after frame.award', () => {
    const rows = deriveProtocolRows(
      [
        stored(1, {
          type: 'game.command',
          payload: {
            frameIndex: 1,
            gameKey: 'free-pyramid',
            commandType: 'frame.award',
            command: { seat: 'B' },
            protocolEntries: [
              {
                source: 'player',
                entryType: 'player-command',
                seat: 'B',
                body: { commandType: 'frame.award' },
              },
            ],
          },
        }),
        stored(2, {
          type: 'frame.completed',
          payload: {
            frameIndex: 1,
            gameKey: 'free-pyramid',
            outcome: { winnerSeat: 'B', winReason: 'target-reached', score: { A: 0, B: 8 } },
          },
        }),
      ],
      { A: 'Alice', B: 'Bob' },
      'UTC',
    )

    expect(rows.map((row) => row.message)).toEqual([{ key: 'match.protocol.commands.frame.award', actor: 'Bob' }])
  })

  test('rejects unsupported archive versions', () => {
    expect(v.safeParse(ProtocolArchiveSchema, { protocolVersion: 2, rows: [] }).success).toBe(false)
  })

  test('uses default messages for unsupported archived protocol values', () => {
    const rows = v.parse(ProtocolArchiveRowsSchema, [
      {
        rowNo: 1,
        receivedAt: 1,
        source: 'player',
        entryType: 'player-command',
        body: { commandType: 'penalty.select', choice: 'invalid' },
      },
      {
        rowNo: 2,
        receivedAt: 2,
        source: 'system',
        entryType: 'system-note',
        body: { systemType: 'automatic-foul', reason: 'invalid' },
      },
      {
        rowNo: 3,
        receivedAt: 3,
        source: 'system',
        entryType: 'system-note',
        body: { systemType: 'winner-determined', reason: 'invalid' },
      },
    ])

    expect(renderProtocolRows(rows, { A: 'Alice', B: 'Bob' }, 'UTC').map((row) => row.message.key)).toEqual([
      'match.protocol.commands.penalty.select.default',
      'match.protocol.system.automatic-foul.default',
      'match.protocol.system.winner-determined.default',
    ])
  })
})
