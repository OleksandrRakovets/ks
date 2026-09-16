# Database Operations

Run commands from the repository root.

## Stores

| Store | Schema | Migrations | Applied by |
| --- | --- | --- | --- |
| D1 `ks` | `packages/application/src/d1/schema.ts` | `d1/migrations/` | Wrangler |
| MatchRoom per-object SQLite | `do/match-room/src/storage/schema.ts` | `do/match-room/drizzle/` | Runtime Drizzle migrator |

These stores have independent lifecycles. MatchRoom SQLite contains active Accepted Commands, command outcomes, the cursor, lifecycle, and final state, but does not persist Protocol. Active and finalizing Protocol is derived by semantic replay. D1 contains players and match rows and is the first independent persistence of the immutable completed Protocol archive.

Drizzle ORM and Kit are pinned to `1.0.0-rc.4`. The project has not been deployed. Do not rewrite migration history after deployment.

## Local D1

```sh
bun run db:migrate:local
bun run db:seed:local
bun run db:studio:local
```

Studio connects to the real local Wrangler D1 and can mutate it. It does not browse Durable Object databases.

For a remote development box, expose Studio only on its Tailscale interface:

```sh
KS_DB_STUDIO_HOST=$(tailscale ip -4) bun run db:studio:local
```

Open the URL Drizzle prints. The browser must be on the same tailnet and able to reach TCP port `4983`.

Use Wrangler for terminal access:

```sh
bunx wrangler d1 execute ks --local --config apps/play/wrangler.jsonc \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

bunx wrangler d1 execute ks --local --config apps/play/wrangler.jsonc \
  --command "SELECT match_id, game_key, status, datetime(created_at / 1000, 'unixepoch', 'localtime') AS created_at FROM matches ORDER BY created_at DESC LIMIT 20;"
```

Replace `--local` with `--remote` only intentionally. `wrangler d1 execute` is not read-only.

## Change D1 Schema

1. Edit `packages/application/src/d1/schema.ts`.
2. Generate SQL: `bunx drizzle-kit generate --config d1/drizzle.config.ts --name <short-name>`.
3. Review the generated SQL and snapshot under `d1/migrations/`.
4. Validate with `bunx drizzle-kit check --config d1/drizzle.config.ts`.
5. Apply locally with `bun run db:migrate:local` and run `bun run check:full`.
6. Apply remotely only as an explicit deployment operation:

```sh
bunx wrangler d1 migrations list ks --remote --config apps/play/wrangler.jsonc
bunx wrangler d1 migrations apply ks --remote --config apps/play/wrangler.jsonc
```

Use Drizzle Kit to generate and Wrangler to apply. Do not use `drizzle-kit push` or `drizzle-kit migrate` for D1.

## Change MatchRoom Schema

1. Edit `do/match-room/src/storage/schema.ts`.
2. Generate SQL: `bunx drizzle-kit generate --config do/match-room/drizzle.config.ts --name <short-name>`.
3. Review the generated SQL and snapshot under `do/match-room/drizzle/`.
4. Add the SQL import and migration key to `do/match-room/drizzle/migrations.js`.
5. Run `bunx drizzle-kit check --config do/match-room/drizzle.config.ts` and `bun run check:full`.

The `migrations` entry in `do/match-room/wrangler.jsonc` manages Durable Object classes, not each object's SQLite schema.

## Reset Local D1

Stop the dev server, then run:

```sh
rm -rf apps/play/.wrangler/state/v3/d1
bun run db:migrate:local
bun run db:seed:local
```

This does not reset MatchRoom Durable Object SQLite state.
