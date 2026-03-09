-- D1 (SQLite) schema for KS

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  control_secret TEXT NOT NULL,
  game_key TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  lock_at INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  match_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_seq INTEGER NOT NULL,
  at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, seq),
  UNIQUE (match_id, event_id)
);

CREATE INDEX IF NOT EXISTS events_match_id_seq ON events(match_id, seq);

CREATE TABLE IF NOT EXISTS match_snapshots (
  match_id TEXT PRIMARY KEY,
  latest_seq INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
