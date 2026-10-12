# Database Operations

Run commands from the repository root.

## Stores

| Store                       | Schema                                  | Migrations               | Applied by               |
| --------------------------- | --------------------------------------- | ------------------------ | ------------------------ |
| D1 binding `DB`              | `packages/application/src/d1/schema.ts` | `packages/application/drizzle/` | Wrangler                 |
| MatchRoom per-object SQLite | `do/match-room/src/storage/schema.ts`   | `do/match-room/drizzle/` | Runtime Drizzle migrator |

The stores have independent migration histories. Application owns D1 tooling; Play supplies the binding and Wrangler configuration. See the [architecture map](decisions/current-architecture.md) for data authority and component guidance for storage boundaries. Do not rewrite applied migration history.

## Production Migration Planning

Follow the [root deployment policy](../AGENTS.md#deployment-safety). Before proposing remote application, identify which schema/data changes the running Worker can tolerate and state whether each migration precedes or follows deployment. Confirm no Active Matches or pending finalization/archival before deploying; remote migrations require explicit authorization.

## Local D1

```sh
bun run --cwd packages/application db:migrate:local
bun run --cwd packages/application db:seed:local
bun run --cwd packages/application db:studio:local
```

The application scripts use Play's Wrangler configuration and the same `worker/play/.wrangler/state` as its dev server.

Wrangler commands select the stable `DB` binding rather than the deployed database name. `--local` uses local SQLite state; `--remote` accesses the bound Cloudflare database (`ks-prod`). Local development does not share production data.

Studio connects to the real local Wrangler D1 and can mutate it. It does not browse Durable Object databases.

For a remote development box, expose Studio only on its Tailscale interface:

```sh
KS_DB_STUDIO_HOST=$(tailscale ip -4) bun run --cwd packages/application db:studio:local
```

Open the URL Drizzle prints. The browser must be on the same tailnet and able to reach TCP port `4983`.

Use Wrangler for terminal access:

```sh
bunx wrangler d1 execute DB --local --config worker/play/wrangler.jsonc \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

bunx wrangler d1 execute DB --local --config worker/play/wrangler.jsonc \
  --command "SELECT match_id, game_key, status, datetime(created_at / 1000, 'unixepoch', 'localtime') AS created_at FROM sparring_matches ORDER BY created_at DESC LIMIT 20;"
```

Replace `--local` with `--remote` only intentionally. `wrangler d1 execute` is not read-only.

## Change D1 Schema

1. Edit `packages/application/src/d1/schema.ts`.
2. Generate SQL: `bun run --cwd packages/application db:generate --name <short-name>`.
3. Review the generated SQL and snapshot under `packages/application/drizzle/`.
4. From `packages/application`, validate with `bunx drizzle-kit check --config drizzle.config.ts`.
5. Apply locally with `bun run --cwd packages/application db:migrate:local` and run `bun run check:full`.
6. Apply remotely only as an explicit deployment operation:

```sh
bunx wrangler d1 migrations list DB --remote --config worker/play/wrangler.jsonc
bunx wrangler d1 migrations apply DB --remote --config worker/play/wrangler.jsonc
```

Use Drizzle Kit to generate and Wrangler to apply. Do not use `drizzle-kit push` or `drizzle-kit migrate` for D1.

For data-only migrations, add `--custom` to the generation command, then edit the generated SQL and follow the same review, validation, and application steps.

Generation commands minify Drizzle's `snapshot.json` metadata without changing its JSON values. Oxfmt excludes these snapshots from CLI and editor formatting; review the SQL for migration behavior.

## Change MatchRoom Schema

1. Edit `do/match-room/src/storage/schema.ts`.
2. Generate SQL: `bun run --cwd do/match-room db:generate --name <short-name>`.
3. Review the generated SQL and snapshot under `do/match-room/drizzle/`.
4. Add the SQL import and migration key to `do/match-room/drizzle/migrations.js`.
5. From `do/match-room`, run `bunx drizzle-kit check --config drizzle.config.ts`, then run `bun run check:full` from the repository root.

The `migrations` entry in `worker/play/wrangler.jsonc` manages Durable Object classes, not each object's SQLite schema. MatchRoom's Workerd integration configuration reads that class setup from Play's configuration.

## Reset Local Data Storage

Stop the dev server, then run:

```sh
bun run db:reset:local
```

This removes the Play and MatchRoom workspace `.wrangler` directories, including local D1 and MatchRoom Durable Object SQLite state, then reapplies D1 migrations and the local player seed. It does not affect remote data.
