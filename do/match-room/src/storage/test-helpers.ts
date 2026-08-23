import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ActiveMatchStore } from './active-match-store'

type SqlStorageValue = ArrayBuffer | string | number | null

class MockSqlCursor<T extends Record<string, SqlStorageValue>> {
  columnNames: string[] = []
  private index = 0
  private readonly rows: T[]
  private readonly written: number

  constructor(rows: T[], written: number) {
    this.rows = rows
    this.written = written
    if (rows.length > 0) this.columnNames = Object.keys(rows[0]!)
  }

  get rowsRead(): number {
    return this.rows.length
  }

  get rowsWritten(): number {
    return this.written
  }

  toArray(): T[] {
    return this.rows
  }

  one(): T {
    if (this.rows.length !== 1) throw new Error(`Expected 1 row, got ${String(this.rows.length)}`)
    return this.rows[0]!
  }

  raw<U extends SqlStorageValue[]>(): IterableIterator<U> {
    const keys = this.columnNames
    // SAFETY: each row value is mapped to the column order declared by columnNames.
    return this.rows.map((row) => keys.map((key) => row[key] ?? null) as U)[Symbol.iterator]()
  }

  next(): { done?: false; value: T } | { done: true; value?: never } {
    if (this.index >= this.rows.length) return { done: true }
    const value = this.rows[this.index]!
    this.index += 1
    return { value }
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.rows[Symbol.iterator]()
  }
}

function createTestSqlStorage(db: Database, failOnAcceptedFactInsert: boolean): SqlStorage {
  const sql = {
    get databaseSize() {
      return 0
    },
    exec<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: any[]) {
      if (failOnAcceptedFactInsert && /insert into "accepted_facts"/i.test(query)) {
        throw new Error('Injected accepted_facts insert failure')
      }
      const stmt = db.prepare(query)
      const rows = bindings.length > 0 ? stmt.all(...bindings) : stmt.all()
      // SAFETY: SQLite changes() returns one numeric column for the immediately preceding statement.
      const written = (db.query('SELECT changes() AS changes').get() as { changes: number }).changes
      // SAFETY: MockSqlCursor implements the cursor surface drizzle reads via exec results.
      return new MockSqlCursor(rows as T[], written) as SqlStorageCursor<T>
    },
  }

  // SAFETY: store tests only call sql.exec; Cursor and Statement are unused by drizzle here.
  return sql as SqlStorage
}

function applyInitialMigration(db: Database): void {
  const migrationPath = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle/20260819215046_init/migration.sql')
  const sql = readFileSync(migrationPath, 'utf8')
  for (const statement of sql
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter(Boolean)) {
    db.exec(statement)
  }
}

function createTestStorage(options?: { failOnAcceptedFactInsert?: boolean }): DurableObjectStorage {
  const db = new Database(':memory:')
  applyInitialMigration(db)
  const failOnAcceptedFactInsert = options?.failOnAcceptedFactInsert ?? false
  let transactionDepth = 0

  const client = {
    sql: createTestSqlStorage(db, failOnAcceptedFactInsert),
    transactionSync<T>(closure: () => T): T {
      if (transactionDepth > 0) return closure()
      transactionDepth += 1
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = closure()
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      } finally {
        transactionDepth -= 1
      }
    },
  }

  // SAFETY: store tests only exercise sql.exec and transactionSync via drizzle durable-sqlite.
  return client as DurableObjectStorage
}

export function createTestStore(options?: { failOnAcceptedFactInsert?: boolean }): ActiveMatchStore {
  return new ActiveMatchStore(createTestStorage(options))
}
