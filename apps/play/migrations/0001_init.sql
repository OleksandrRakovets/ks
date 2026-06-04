-- D1 (SQLite) schema for KS

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  control_secret TEXT NOT NULL,
  game_key TEXT NOT NULL,
  config_json TEXT NOT NULL,
  latest_seq INTEGER NOT NULL,
  seat_a_player_ref TEXT NOT NULL,
  seat_b_player_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  lock_at INTEGER,
  CHECK (seat_a_player_ref != seat_b_player_ref),
  CHECK (seat_a_player_ref GLOB 'gp_*' OR seat_a_player_ref GLOB 'vp_*'),
  CHECK (seat_b_player_ref GLOB 'gp_*' OR seat_b_player_ref GLOB 'vp_*')
);

CREATE TABLE IF NOT EXISTS facts (
  match_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  fact_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_seq INTEGER NOT NULL,
  at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, seq),
  UNIQUE (match_id, fact_id)
);

CREATE INDEX IF NOT EXISTS facts_match_id_seq ON facts(match_id, seq);

CREATE TABLE IF NOT EXISTS match_snapshots (
  match_id TEXT PRIMARY KEY,
  latest_seq INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS match_protocol_archives (
  match_id TEXT PRIMARY KEY,
  source_latest_seq INTEGER NOT NULL,
  protocol_version INTEGER NOT NULL,
  rows_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guest_players (
  guest_player_id TEXT PRIMARY KEY,
  first_name_uk TEXT NOT NULL,
  last_name_uk TEXT NOT NULL,
  first_name_en TEXT NOT NULL,
  last_name_en TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verified_players (
  verified_player_id TEXT PRIMARY KEY,
  first_name_uk TEXT NOT NULL,
  last_name_uk TEXT NOT NULL,
  first_name_en TEXT NOT NULL,
  last_name_en TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
