# Database Operations

Run commands from the repository root.

## Stores

| Store                       | Schema                                  | Migrations               | Applied by               |
| --------------------------- | --------------------------------------- | ------------------------ | ------------------------ |
| D1 `ks`                     | `packages/application/src/d1/schema.ts` | `d1/migrations/`         | Wrangler                 |
| MatchRoom per-object SQLite | `do/match-room/src/storage/schema.ts`   | `do/match-room/drizzle/` | Runtime Drizzle migrator |

These stores have independent lifecycles. MatchRoom SQLite contains Accepted Commands and outcomes, one immutable aggregate checkpoint per acceptance sequence, complete Protocol entries, the acceptance cursor, compact score projection, and lifecycle. Rich reads restore and project the checkpoint at the acceptance cursor; controls are request-local and are not persisted. D1 contains players and match rows and receives the unchanged final Protocol archive and projected Final Match State. Existing rooms without checkpoints require an explicit migration decision; do not reset or silently replay them.

Drizzle ORM and Kit are pinned to `1.0.0-rc.4`. Do not rewrite applied migration history.

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
  --command "SELECT match_id, game_key, status, datetime(created_at / 1000, 'unixepoch', 'localtime') AS created_at FROM sparring_matches ORDER BY created_at DESC LIMIT 20;"
```

Replace `--local` with `--remote` only intentionally. `wrangler d1 execute` is not read-only.

## Change D1 Schema

1. Edit `packages/application/src/d1/schema.ts`.
2. Generate SQL: `bun run db:generate:d1 --name <short-name>`.
3. Review the generated SQL and snapshot under `d1/migrations/`.
4. Validate with `bunx drizzle-kit check --config d1/drizzle.config.ts`.
5. Apply locally with `bun run db:migrate:local` and run `bun run check:full`.
6. Apply remotely only as an explicit deployment operation:

```sh
bunx wrangler d1 migrations list ks --remote --config apps/play/wrangler.jsonc
bunx wrangler d1 migrations apply ks --remote --config apps/play/wrangler.jsonc
```

Use Drizzle Kit to generate and Wrangler to apply. Do not use `drizzle-kit push` or `drizzle-kit migrate` for D1.

For data-only migrations, add `--custom` to the generation command, then edit the generated SQL and follow the same review, validation, and application steps.

Generation commands minify Drizzle's `snapshot.json` metadata without changing its JSON values. Oxfmt excludes these snapshots from CLI and editor formatting; review the SQL for migration behavior.

## Change MatchRoom Schema

1. Edit `do/match-room/src/storage/schema.ts`.
2. Generate SQL: `bun run db:generate:match-room --name <short-name>`.
3. Review the generated SQL and snapshot under `do/match-room/drizzle/`.
4. Add the SQL import and migration key to `do/match-room/drizzle/migrations.js`.
5. Run `bunx drizzle-kit check --config do/match-room/drizzle.config.ts` and `bun run check:full`.

The `migrations` entry in `apps/play/wrangler.jsonc` manages Durable Object classes, not each object's SQLite schema. `do/match-room/wrangler.test.jsonc` mirrors that class setup only for Workerd integration tests.

## Reset Local Data Storage

Stop the dev server, then run:

```sh
bun run db:reset:local
```

This removes the Play and MatchRoom workspace `.wrangler` directories, including local D1 and MatchRoom Durable Object SQLite state, then reapplies D1 migrations and the local player seed. It does not affect remote data.
