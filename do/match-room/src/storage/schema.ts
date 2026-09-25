import type { CommandId, MatchId, UnixEpochMilliseconds } from '@ks/core'
import { sql } from 'drizzle-orm'
import { check, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const activeMatches = sqliteTable(
  'active_matches',
  {
    matchId: text('match_id').$type<MatchId>().primaryKey(),
    controlSecret: text('control_secret').notNull(),
    configJson: text('config_json').notNull(),
    latestSeq: integer('latest_seq').notNull(),
    currentCheckpointSeq: integer('current_checkpoint_seq').notNull(),
    scoreJson: text('score_json').notNull(),
    status: text('status').$type<'active' | 'finalizing'>().notNull(),
    createdAt: integer('created_at').$type<UnixEpochMilliseconds>().notNull(),
    finalStateJson: text('final_state_json'),
    gameResultJson: text('game_result_json'),
    endedAt: integer('ended_at').$type<UnixEpochMilliseconds>(),
  },
  (table) => [
    check(
      'active_matches_finalizing_fields',
      sql`(${table.status} = 'active' AND ${table.finalStateJson} IS NULL AND ${table.endedAt} IS NULL) OR (${table.status} = 'finalizing' AND ${table.finalStateJson} IS NOT NULL AND ${table.endedAt} IS NOT NULL)`,
    ),
  ],
)

/** Immutable executable state and read presentation at each ordinary acceptance (including creation at 0). */
export const checkpoints = sqliteTable(
  'checkpoints',
  {
    seq: integer('seq').primaryKey(),
    previousCheckpointSeq: integer('previous_checkpoint_seq'),
    aggregateJson: text('aggregate_json').notNull(),
    stateJson: text('state_json').notNull(),
    gamePresentationJson: text('game_presentation_json'),
    lastPlayerAcceptedSeq: integer('last_player_accepted_seq'),
    lastPlayerEntryIndex: integer('last_player_entry_index'),
  },
  (table) => [
    check(
      'checkpoints_reference_fields',
      sql`(${table.lastPlayerAcceptedSeq} IS NULL AND ${table.lastPlayerEntryIndex} IS NULL) OR (${table.lastPlayerAcceptedSeq} IS NOT NULL AND ${table.lastPlayerAcceptedSeq} > 0 AND ${table.lastPlayerEntryIndex} IS NOT NULL AND ${table.lastPlayerEntryIndex} >= 0)`,
    ),
    check(
      'checkpoints_predecessor',
      sql`(${table.seq} = 0 AND ${table.previousCheckpointSeq} IS NULL) OR (${table.seq} > 0 AND ${table.previousCheckpointSeq} IS NOT NULL AND ${table.previousCheckpointSeq} >= 0 AND ${table.previousCheckpointSeq} < ${table.seq})`,
    ),
  ],
)

export const protocolEntries = sqliteTable(
  'protocol_entries',
  {
    acceptedSeq: integer('accepted_seq').notNull(),
    entryIndex: integer('entry_index').notNull(),
    entryJson: text('entry_json').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.acceptedSeq, table.entryIndex] }),
    check('protocol_entries_position', sql`${table.acceptedSeq} > 0 AND ${table.entryIndex} >= 0`),
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
