import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/sqlite-core'

import { acceptedFacts, activeMatches, commandReceipts } from './schema'

describe('active MatchRoom SQLite schema', () => {
  test('owns active match state, accepted facts, and command receipts', () => {
    expect(getTableConfig(activeMatches).columns.map((column) => column.name)).toEqual([
      'match_id',
      'control_secret',
      'config_json',
      'latest_seq',
      'created_at',
    ])
    expect(getTableConfig(acceptedFacts).columns.map((column) => column.name)).toEqual([
      'seq',
      'fact_id',
      'type',
      'payload_json',
      'client_id',
      'client_seq',
      'at',
      'received_at',
    ])
    expect(getTableConfig(commandReceipts).columns.map((column) => column.name)).toEqual([
      'command_id',
      'request_json',
      'accepted_json',
    ])
  })
})
