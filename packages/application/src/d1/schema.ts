import type { UnixEpochMilliseconds } from '@ks/core'
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const StoredMatchStatus = {
  creating: 'creating',
  active: 'active',
  finalizing: 'finalizing',
  finished: 'finished',
} as const
export type StoredMatchStatus = (typeof StoredMatchStatus)[keyof typeof StoredMatchStatus]

export const matches = sqliteTable(
  'matches',
  {
    matchId: text('match_id').primaryKey(),
    gameKey: text('game_key').notNull(),
    seatAPlayerRef: text('seat_a_player_ref').notNull(),
    seatBPlayerRef: text('seat_b_player_ref').notNull(),
    status: text('status').$type<StoredMatchStatus>().notNull(),
    createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
    endedAt: integer('ended_at').$type<UnixEpochMilliseconds>(),
  },
  (table) => [
    check('matches_distinct_players', sql`${table.seatAPlayerRef} != ${table.seatBPlayerRef}`),
    check('matches_seat_a_player_ref_format', sql`${table.seatAPlayerRef} GLOB 'gp_*' OR ${table.seatAPlayerRef} GLOB 'vp_*'`),
    check('matches_seat_b_player_ref_format', sql`${table.seatBPlayerRef} GLOB 'gp_*' OR ${table.seatBPlayerRef} GLOB 'vp_*'`),
  ],
)

export const matchProtocolArchives = sqliteTable('match_protocol_archives', {
  matchId: text('match_id').primaryKey(),
  sourceLatestSeq: integer('source_latest_seq').notNull(),
  protocolVersion: integer('protocol_version').notNull(),
  rowsJson: text('rows_json').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
})

export const guestPlayers = sqliteTable('guest_players', {
  guestPlayerId: text('guest_player_id').primaryKey(),
  firstNameUk: text('first_name_uk').notNull(),
  lastNameUk: text('last_name_uk').notNull(),
  firstNameEn: text('first_name_en').notNull(),
  lastNameEn: text('last_name_en').notNull(),
  createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
})

export const verifiedPlayers = sqliteTable('verified_players', {
  verifiedPlayerId: text('verified_player_id').primaryKey(),
  firstNameUk: text('first_name_uk').notNull(),
  lastNameUk: text('last_name_uk').notNull(),
  firstNameEn: text('first_name_en').notNull(),
  lastNameEn: text('last_name_en').notNull(),
  createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
})
