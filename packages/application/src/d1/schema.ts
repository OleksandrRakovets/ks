import type {
  GuestPlayerId,
  MatchId,
  NonNegativeInteger,
  PlayerRef,
  UnixEpochMilliseconds,
  VerifiedPlayerId,
} from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const StoredMatchStatus = {
  creating: 'creating',
  active: 'active',
  finished: 'finished',
} as const

export type StoredMatchStatus = (typeof StoredMatchStatus)[keyof typeof StoredMatchStatus]

export const sparringMatches = sqliteTable(
  'sparring_matches',
  {
    matchId: text('match_id').$type<typeof MatchId.Type>().primaryKey(),
    gameKey: text('game_key').$type<typeof GameKey.Type>().notNull(),
    seatAPlayerRef: text('seat_a_player_ref').$type<typeof PlayerRef.Type>().notNull(),
    seatBPlayerRef: text('seat_b_player_ref').$type<typeof PlayerRef.Type>().notNull(),
    status: text('status').$type<StoredMatchStatus>().notNull(),
    createdAt: integer('created_at').$type<typeof UnixEpochMilliseconds.Type>().notNull(),
    endedAt: integer('ended_at').$type<typeof UnixEpochMilliseconds.Type>(),
    finalSourceLatestSeq: integer('final_source_latest_seq').$type<typeof NonNegativeInteger.Type>(),
    finalScoreJson: text('final_score_json'),
  },
  (table) => [
    index('sparring_matches_status_created_at_match_id_idx').on(table.status, table.createdAt, table.matchId),
    index('sparring_matches_status_ended_at_match_id_idx').on(table.status, table.endedAt, table.matchId),
    check('sparring_matches_distinct_players', sql`${table.seatAPlayerRef} != ${table.seatBPlayerRef}`),
    check(
      'sparring_matches_seat_a_player_ref_format',
      sql`${table.seatAPlayerRef} GLOB 'gp_*' OR ${table.seatAPlayerRef} GLOB 'vp_*'`,
    ),
    check(
      'sparring_matches_seat_b_player_ref_format',
      sql`${table.seatBPlayerRef} GLOB 'gp_*' OR ${table.seatBPlayerRef} GLOB 'vp_*'`,
    ),
  ],
)

export const sparringMatchArchives = sqliteTable('sparring_match_archives', {
  matchId: text('match_id').$type<typeof MatchId.Type>().primaryKey(),
  sourceLatestSeq: integer('source_latest_seq').notNull(),
  protocolVersion: integer('protocol_version').notNull(),
  rowsJson: text('rows_json').notNull(),
  stateJson: text('state_json').notNull(),
  gameResultJson: text('game_result_json'),
  createdAt: integer('created_at').$type<typeof UnixEpochMilliseconds.Type>().notNull(),
})

export const guestPlayers = sqliteTable('guest_players', {
  guestPlayerId: text('guest_player_id').$type<typeof GuestPlayerId.Type>().primaryKey(),
  firstNameUk: text('first_name_uk').notNull(),
  lastNameUk: text('last_name_uk').notNull(),
  firstNameEn: text('first_name_en').notNull(),
  lastNameEn: text('last_name_en').notNull(),
  createdAt: integer('created_at').$type<typeof UnixEpochMilliseconds.Type>().notNull(),
})

export const verifiedPlayers = sqliteTable('verified_players', {
  verifiedPlayerId: text('verified_player_id').$type<typeof VerifiedPlayerId.Type>().primaryKey(),
  firstNameUk: text('first_name_uk').notNull(),
  lastNameUk: text('last_name_uk').notNull(),
  firstNameEn: text('first_name_en').notNull(),
  lastNameEn: text('last_name_en').notNull(),
  createdAt: integer('created_at').$type<typeof UnixEpochMilliseconds.Type>().notNull(),
})
