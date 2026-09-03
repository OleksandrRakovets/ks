import type { CommandId, MatchId, UnixEpochMilliseconds } from '@ks/core'
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const activeMatches = sqliteTable(
  'active_matches',
  {
    matchId: text('match_id').$type<MatchId>().primaryKey(),
    controlSecret: text('control_secret').notNull(),
    configJson: text('config_json').notNull(),
    latestSeq: integer('latest_seq').notNull(),
    status: text('status').$type<'active' | 'finalizing'>().notNull(),
    createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
    finalStateJson: text('final_state_json'),
    endedAt: integer('ended_at').$type<UnixEpochMilliseconds>(),
  },
  (table) => [
    check(
      'active_matches_terminal_fields',
      sql`(${table.status} = 'active' AND ${table.finalStateJson} IS NULL AND ${table.endedAt} IS NULL) OR (${table.status} = 'finalizing' AND ${table.finalStateJson} IS NOT NULL AND ${table.endedAt} IS NOT NULL)`,
    ),
  ],
)

export const commands = sqliteTable(
  'commands',
  {
    commandId: text('command_id').$type<CommandId>().primaryKey(),
    matchId: text('match_id')
      .$type<MatchId>()
      .notNull()
      .references(() => activeMatches.matchId),
    requestJson: text('request_json').notNull(),
    outcome: text('outcome').$type<'accepted' | 'rejected'>().notNull(),
    acceptedSeq: integer('accepted_seq'),
    acceptedAt: integer('accepted_at').$type<UnixEpochMilliseconds>(),
    rejectionJson: text('rejection_json'),
  },
  (table) => [
    unique('commands_accepted_seq_unique').on(table.acceptedSeq),
    check(
      'commands_outcome_fields',
      sql`(${table.outcome} = 'accepted' AND ${table.acceptedSeq} > 0 AND ${table.acceptedAt} IS NOT NULL AND ${table.rejectionJson} IS NULL) OR (${table.outcome} = 'rejected' AND ${table.acceptedSeq} IS NULL AND ${table.acceptedAt} IS NULL AND ${table.rejectionJson} IS NOT NULL)`,
    ),
  ],
)
