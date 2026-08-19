import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/sqlite-core'

import { facts, matches } from './schema'

describe('global D1 schema', () => {
  test('retains the match constraints and fact keys required by the global catalog', () => {
    const matchConfig = getTableConfig(matches)
    const factsConfig = getTableConfig(facts)

    expect(matchConfig.columns.map((column) => column.name)).toEqual([
      'match_id',
      'control_secret',
      'game_key',
      'config_json',
      'latest_seq',
      'seat_a_player_ref',
      'seat_b_player_ref',
      'status',
      'created_at',
      'ended_at',
      'lock_at',
    ])
    expect(matchConfig.checks.map((constraint) => constraint.name)).toEqual([
      'matches_distinct_players',
      'matches_seat_a_player_ref_format',
      'matches_seat_b_player_ref_format',
    ])
    expect(factsConfig.primaryKeys[0]?.columns.map((column) => column.name)).toEqual(['match_id', 'seq'])
    expect(factsConfig.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual(['match_id', 'fact_id'])
    expect(factsConfig.indexes[0]?.config.name).toBe('facts_match_id_seq')
  })
})
