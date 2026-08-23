import { describe, expect, test } from 'bun:test'

import { MatchIdSchema, MatchStateSchema } from '@ks/core'
import * as v from 'valibot'

import { getProtocolArchive } from './protocol-archives'
import type { ApplicationDatabase } from './types'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const snapshot = v.parse(MatchStateSchema, {
  matchId,
  gameKey: 'historical-game',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  status: 'finished',
  currentFrameIndex: 1,
  framesWonBySeat: { A: 1, B: 0 },
  frames: [{ frameIndex: 1, pointsBySeat: { A: 8, B: 2 }, breakerSeat: 'A', winnerSeat: 'A' }],
})

const validRow = {
  matchId,
  sourceLatestSeq: 4,
  protocolVersion: 1,
  rowsJson: '[]',
  stateJson: JSON.stringify(snapshot),
}

type ProtocolArchiveDatabaseRow = {
  matchId: string
  sourceLatestSeq: number
  protocolVersion: number
  rowsJson: string
  stateJson: string
}

function databaseReturning(row: ProtocolArchiveDatabaseRow): ApplicationDatabase {
  const query = {
    from() {
      return this
    },
    where() {
      return this
    },
    async get() {
      return row
    },
  }
  const db: ApplicationDatabase = Object.create(null)
  Object.defineProperty(db, 'select', { value: () => query })
  return db
}

describe('D1 protocol archive codec', () => {
  test('returns decoded semantic rows and a historical syntactic game-key snapshot', async () => {
    expect(await getProtocolArchive(databaseReturning(validRow), matchId)).toEqual({
      sourceLatestSeq: 4,
      protocolVersion: 1,
      rows: [],
      state: snapshot,
    })
  })

  test.each([
    ['malformed JSON', { ...validRow, rowsJson: '[' }],
    ['unfinished state', { ...validRow, stateJson: JSON.stringify({ ...snapshot, status: 'active' }) }],
    [
      'state match mismatch',
      {
        ...validRow,
        stateJson: JSON.stringify({ ...snapshot, matchId: '01ARZ3NDEKTSV4RRFFQ69G5FAA' }),
      },
    ],
    ['requested match mismatch', { ...validRow, matchId: '01ARZ3NDEKTSV4RRFFQ69G5FAA' }],
  ])('fails %s as contextual archive corruption', async (_label, row) => {
    await expect(getProtocolArchive(databaseReturning(row), matchId)).rejects.toThrow(
      `Protocol archive storage corruption for match ${matchId}`,
    )
  })

  test('reports an unsupported protocol version explicitly', async () => {
    await expect(getProtocolArchive(databaseReturning({ ...validRow, protocolVersion: 2 }), matchId)).rejects.toThrow(
      `Unsupported protocol archive version 2 for match ${matchId}`,
    )
  })
})
