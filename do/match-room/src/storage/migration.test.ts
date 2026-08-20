import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import migrationsBundle from '../../drizzle/migrations.js'

function applyMigration(db: Database, migration: string): void {
  for (const statement of migration.split('--> statement-breakpoint')) db.exec(statement)
}

describe('accepted facts match ID migration', () => {
  test('backfills existing rows, enforces the foreign key, ordering, and receipt identity', () => {
    expect(Object.keys(migrationsBundle.migrations)).toEqual(['20260819215046_init', '20260820122224_eminent_kid_colt'])
    const [initialMigrationPath, matchIdMigrationPath] = Object.values(migrationsBundle.migrations)
    if (!initialMigrationPath || !matchIdMigrationPath) throw new Error('Incomplete MatchRoom runtime migration bundle')
    const initialMigration = readFileSync(initialMigrationPath, 'utf8')
    const matchIdMigration = readFileSync(matchIdMigrationPath, 'utf8')
    const db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    applyMigration(db, initialMigration)
    db.exec(`
      INSERT INTO active_matches VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAV', 'secret', '{}', 2, 'active', 1700000000000);
      INSERT INTO accepted_facts VALUES (1, '01ARZ3NDEKTSV4RRFFQ69G5FAA', 'match.created', '{}', 'server0000', 0, 1700000000000, 1700000000000);
      INSERT INTO accepted_facts VALUES (2, '01ARZ3NDEKTSV4RRFFQ69G5FAB', 'frame.started', '{}', 'server0000', 1, 1700000000001, 1700000000001);
      INSERT INTO command_receipts VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAE', '{"command":"private"}', '[{"seq":2,"factId":"01ARZ3NDEKTSV4RRFFQ69G5FAB"}]');
    `)

    applyMigration(db, matchIdMigration)

    expect(db.query('SELECT seq, fact_id, match_id FROM accepted_facts ORDER BY seq').all()).toEqual([
      { seq: 1, fact_id: '01ARZ3NDEKTSV4RRFFQ69G5FAA', match_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
      { seq: 2, fact_id: '01ARZ3NDEKTSV4RRFFQ69G5FAB', match_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    ])
    expect(db.query('SELECT command_id, request_json, accepted_json FROM command_receipts').get()).toEqual({
      command_id: '01ARZ3NDEKTSV4RRFFQ69G5FAE',
      request_json: '{"command":"private"}',
      accepted_json: '[{"seq":2,"factId":"01ARZ3NDEKTSV4RRFFQ69G5FAB"}]',
    })
    expect(() =>
      db.exec(
        `INSERT INTO accepted_facts VALUES (3, '01ARZ3NDEKTSV4RRFFQ69G5FAC', '01ARZ3NDEKTSV4RRFFQ69G5FAZ', 'match.ended', '{}', 'server0000', 2, 1700000000002, 1700000000002)`,
      ),
    ).toThrow()
    expect(() => db.exec(`INSERT INTO command_receipts VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAE', '{}', '[]')`)).toThrow()
    db.close()
  })
})
