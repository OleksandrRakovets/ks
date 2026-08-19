import type { UnixEpochMilliseconds } from '@ks/core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const activeMatches = sqliteTable('active_matches', {
  matchId: text('match_id').primaryKey(),
  controlSecret: text('control_secret').notNull(),
  configJson: text('config_json').notNull(),
  latestSeq: integer('latest_seq').notNull(),
  status: text('status').$type<'active' | 'finalizing'>().notNull(),
  createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
})

export const acceptedFacts = sqliteTable('accepted_facts', {
  seq: integer('seq').primaryKey(),
  factId: text('fact_id').notNull().unique(),
  type: text('type').notNull(),
  payloadJson: text('payload_json').notNull(),
  clientId: text('client_id').notNull(),
  clientSeq: integer('client_seq').notNull(),
  at: integer('at').$type<UnixEpochMilliseconds>().notNull(),
  receivedAt: integer('received_at').$type<UnixEpochMilliseconds>().notNull(),
})

export const commandReceipts = sqliteTable('command_receipts', {
  commandId: text('command_id').primaryKey(),
  requestJson: text('request_json').notNull(),
  acceptedJson: text('accepted_json').notNull(),
})
