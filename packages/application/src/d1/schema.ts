import type { GuestPlayerId, MatchId, PlayerRef, UnixEpochMilliseconds, VerifiedPlayerId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const StoredMatchStatus = {
  creating: 'creating',
  active: 'active',
  finished: 'finished',
} as const

export type StoredMatchStatus = (typeof StoredMatchStatus)[keyof typeof StoredMatchStatus]

export const matches = sqliteTable(
  'matches',
  {
    matchId: text('match_id').$type<MatchId>().primaryKey(),
    gameKey: text('game_key').$type<RegisteredGameKey>().notNull(),
    seatAPlayerRef: text('seat_a_player_ref').$type<PlayerRef>().notNull(),
    seatBPlayerRef: text('seat_b_player_ref').$type<PlayerRef>().notNull(),
    status: text('status').$type<StoredMatchStatus>().notNull(),
    createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
    endedAt: integer('ended_at').$type<UnixEpochMilliseconds>(),
  },
  (table) => [
    check('matches_distinct_players', sql`${table.seatAPlayerRef} != ${table.seatBPlayerRef}`),
    check(
      'matches_seat_a_player_ref_format',
      sql`${table.seatAPlayerRef} GLOB 'gp_*' OR ${table.seatAPlayerRef} GLOB 'vp_*'`,
    ),
    check(
      'matches_seat_b_player_ref_format',
      sql`${table.seatBPlayerRef} GLOB 'gp_*' OR ${table.seatBPlayerRef} GLOB 'vp_*'`,
    ),
  ],
)

export const matchProtocolArchives = sqliteTable('match_protocol_archives', {
  matchId: text('match_id').$type<MatchId>().primaryKey(),
  sourceLatestSeq: integer('source_latest_seq').notNull(),
  protocolVersion: integer('protocol_version').notNull(),
  rowsJson: text('rows_json').notNull(),
  stateJson: text('state_json').notNull(),
  createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
})

export const guestPlayers = sqliteTable('guest_players', {
  guestPlayerId: text('guest_player_id').$type<GuestPlayerId>().primaryKey(),
  firstNameUk: text('first_name_uk').notNull(),
  lastNameUk: text('last_name_uk').notNull(),
  firstNameEn: text('first_name_en').notNull(),
  lastNameEn: text('last_name_en').notNull(),
  createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
})

export const verifiedPlayers = sqliteTable('verified_players', {
  verifiedPlayerId: text('verified_player_id').$type<VerifiedPlayerId>().primaryKey(),
  firstNameUk: text('first_name_uk').notNull(),
  lastNameUk: text('last_name_uk').notNull(),
  firstNameEn: text('first_name_en').notNull(),
  lastNameEn: text('last_name_en').notNull(),
  createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
})
