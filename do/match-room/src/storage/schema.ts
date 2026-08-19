import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const activeMatches = sqliteTable('active_matches', {
  matchId: text('match_id').primaryKey(),
  controlSecret: text('control_secret').notNull(),
  configJson: text('config_json').notNull(),
  latestSeq: integer('latest_seq').notNull(),
})

export const acceptedFacts = sqliteTable(
  'accepted_facts',
  {
    seq: integer('seq').primaryKey(),
    factId: text('fact_id').notNull().unique(),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    clientId: text('client_id').notNull(),
    clientSeq: integer('client_seq').notNull(),
    at: integer('at').notNull(),
    receivedAt: integer('received_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.seq] })],
)

export const commandReceipts = sqliteTable('command_receipts', {
  commandId: text('command_id').primaryKey(),
  requestJson: text('request_json').notNull(),
  acceptedJson: text('accepted_json').notNull(),
})
