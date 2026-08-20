import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  ClientIdSchema,
  CommandIdSchema,
  MatchIdSchema,
  newFactId,
  type StoredFact,
  StoredFactSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import * as v from 'valibot'

import migrationsBundle from '../../drizzle/migrations.js'
import { decodeStoredFactRow, encodeStoredFactRow, type StoredFactRow } from './accepted-fact-row'
import { ActiveMatchStore } from './store'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const clientId = v.parse(ClientIdSchema, 'server0000')
const at = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000)

function storedFact(seq: number, type: StoredFact['type'], payload: StoredFact['payload']): StoredFact {
  return v.parse(StoredFactSchema, {
    seq,
    factId: newFactId(),
    matchId,
    clientId,
    clientSeq: seq,
    at,
    receivedAt: at,
    type,
    payload,
  })
}

const facts: StoredFact[] = [
  storedFact(1, 'match.created', {
    matchId,
    gameKey: 'strila-v2',
    targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 1 },
    firstBreakerSeat: 'A',
  }),
  storedFact(2, 'frame.started', {
    frameIndex: 1,
    gameKey: 'strila-v2',
    targetPointsBySeat: { A: 9, B: 9 },
    breakerSeat: 'A',
  }),
  storedFact(3, 'game.command', {
    frameIndex: 1,
    gameKey: 'strila-v2',
    commandType: 'frame.commence',
    command: { seat: 'A' },
    protocolEntries: [{ source: 'player', entryType: 'player-command', seat: 'A', body: {} }],
  }),
  storedFact(4, 'frame.completed', {
    frameIndex: 1,
    gameKey: 'strila-v2',
    outcome: { winnerSeat: 'A', score: { A: 9, B: 4 }, winReason: 'target-reached' },
  }),
  storedFact(5, 'frame.reopened', { frameIndex: 1, reason: 'correction' }),
  storedFact(6, 'match.ended', { winnerSeat: 'A' }),
]

function rowFor(fact: StoredFact) {
  const { payload, ...row } = fact
  return { ...row, payloadJson: JSON.stringify(payload) }
}

function storeForRows(rows: object[]): ActiveMatchStore {
  const query = {
    from() {
      return this
    },
    where() {
      return this
    },
    orderBy() {
      return this
    },
    limit() {
      return this
    },
    all() {
      return rows
    },
  }
  const store: ActiveMatchStore = Object.create(ActiveMatchStore.prototype)
  Object.defineProperty(store, 'db', { value: { select: () => query } })
  return store
}

function applyRuntimeMigrations(db: Database): void {
  for (const migrationPath of Object.values(migrationsBundle.migrations)) {
    const migration = readFileSync(migrationPath, 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) db.exec(statement)
  }
}

describe('MatchRoom stored fact rows', () => {
  test('round-trips every fact payload variant through actual SQLite using the production row mapping and codec', () => {
    const db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    applyRuntimeMigrations(db)
    db.exec(`INSERT INTO active_matches VALUES ('${matchId}', 'secret', '{}', ${facts.length}, 'finalizing', ${at})`)
    const insert = db.query<unknown, Record<string, string | number>>(`
      INSERT INTO accepted_facts (
        seq, fact_id, match_id, type, payload_json, client_id, client_seq, at, received_at
      ) VALUES ($seq, $factId, $matchId, $type, $payloadJson, $clientId, $clientSeq, $at, $receivedAt)
    `)
    for (const fact of facts) {
      const row = encodeStoredFactRow(fact)
      const parameters: Record<string, string | number> = {}
      for (const [key, value] of Object.entries(row)) parameters[`$${key}`] = value
      insert.run(parameters)
    }

    const rows = db
      .query<StoredFactRow, []>(`
        SELECT
          seq,
          fact_id AS factId,
          match_id AS matchId,
          type,
          payload_json AS payloadJson,
          client_id AS clientId,
          client_seq AS clientSeq,
          at,
          received_at AS receivedAt
        FROM accepted_facts
        ORDER BY seq
      `)
      .all()

    expect(rows.map(decodeStoredFactRow)).toEqual(facts)
    expect(rows.map((row) => row.matchId)).toEqual(facts.map((fact) => fact.matchId))
    db.close()
  })

  test.each([
    ['invalid JSON', (row: ReturnType<typeof rowFor>) => ({ ...row, payloadJson: '{' })],
    [
      'invalid discriminator and payload pair',
      (row: ReturnType<typeof rowFor>) => ({ ...row, type: 'match.ended', payloadJson: JSON.stringify({ frameIndex: 1 }) }),
    ],
    ['invalid scalar', (row: ReturnType<typeof rowFor>) => ({ ...row, seq: 0 })],
  ])('fails replay on %s instead of omitting the row', (_label, corrupt) => {
    const row = corrupt(rowFor(facts[0]!))
    expect(() => storeForRows([row]).factsAfter(0)).toThrow('accepted_facts storage corruption at sequence')
  })

  test('returns the same canonical accepted facts when a command receipt is replayed', () => {
    const commandId = v.parse(CommandIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAE')
    const accepted = facts.slice(0, 2).map(({ seq, factId }) => ({ seq, factId }))
    const store = storeForRows([{ commandId, requestJson: '{}', acceptedJson: JSON.stringify(accepted) }])

    expect(store.receipt(commandId)).toEqual({ requestJson: '{}', accepted })
    expect(store.receipt(commandId)).toEqual({ requestJson: '{}', accepted })
  })

  test('fails malformed accepted receipt JSON as contextual storage corruption', () => {
    const commandId = v.parse(CommandIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAE')
    const store = storeForRows([{ commandId, requestJson: 'secret request', acceptedJson: '[' }])

    expect(() => store.receipt(commandId)).toThrow(`command_receipts storage corruption for command ${commandId}`)
  })
})
