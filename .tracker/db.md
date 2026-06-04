# DB Quick Guide

Project DB binding name: `ks` (Cloudflare D1)

## 1) Connect and inspect values

Run commands from `clients/rr7` (or use `bun run --cwd clients/rr7 ...` from repo root).

### Local DB

- List tables:
  - `bunx wrangler d1 execute ks --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"`
- Check matches:
  - `bunx wrangler d1 execute ks --local --command "SELECT match_id, game_key, status, created_at FROM matches ORDER BY created_at DESC LIMIT 20;"`
- Check recent events for one match:
  - `bunx wrangler d1 execute ks --local --command "SELECT seq, type, client_id, at FROM facts WHERE match_id = '<match-id>' ORDER BY seq DESC LIMIT 50;"`

### Remote DB

- Same commands, but replace `--local` with `--remote`.
- Example:
  - `bunx wrangler d1 execute ks --remote --command "SELECT match_id, game_key, status FROM matches ORDER BY created_at DESC LIMIT 20;"`

## 2) Drop/reset local DB

Because we are still iterating on initial migrations, easiest local reset is deleting Wrangler local D1 state.

From repo root:

- `rm -rf clients/rr7/.wrangler/state/v3/d1`
- `bun run db:migrate:local`

After reset, restart dev server if it was running.
