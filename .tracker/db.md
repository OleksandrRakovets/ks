# Database Quick Guide

Run commands below from the repository root unless stated otherwise.

## Two independent SQLite lifecycles

| Store                                | Owns                                                   | Drizzle schema                          | Generated migrations     | Applied by                           |
| ------------------------------------ | ------------------------------------------------------ | --------------------------------------- | ------------------------ | ------------------------------------ |
| Cloudflare D1 `ks`                   | Global match catalog, protocol archives, players       | `packages/application/src/d1/schema.ts` | `d1/migrations/`         | Wrangler D1 migrations               |
| One SQLite database per MatchRoom DO | Active match config, facts, sequence, command receipts | `do/match-room/src/storage/schema.ts`   | `do/match-room/drizzle/` | MatchRoom's runtime Drizzle migrator |

Active facts are no longer stored in D1. Do not expect a D1 `facts` table: inspect an active match through MatchRoom/application APIs. Finished protocol rows are archived in D1's `match_protocol_archives` table.

Drizzle owns the TypeScript schemas and generates SQL. Cloudflare still owns database creation, D1 migration bookkeeping, bindings, and per-object storage.

## Browse local D1 with Drizzle Studio

After creating the local database at least once, start the visual table browser:

```sh
bun run db:studio:local
```

Drizzle prints a `local.drizzle.studio` URL. Open it to browse, filter, add, edit, or delete rows in the local D1 database. Studio writes to the real local Wrangler database, so treat edits as data changes rather than a read-only preview.

When the dev box is remote, bind Studio to the box's Tailscale address instead of browser-local `127.0.0.1`:

```sh
KS_DB_STUDIO_HOST=$(tailscale ip -4) bun run db:studio:local
```

Open the exact URL Drizzle prints, such as `https://local.drizzle.studio?host=100.x.x.x`. The browser machine must be connected to the same tailnet and able to reach TCP port `4983`. Binding to the specific Tailscale IP exposes the Studio gateway only on that interface; avoid `0.0.0.0` unless broader network exposure is intentional.

If no local SQLite file exists yet:

```sh
bun run db:migrate:local
bun run db:seed:local
bun run db:studio:local
```

The Studio command targets global D1 only. It does not combine or browse all per-match Durable Object databases.

## Inspect D1 from the terminal

Wrangler remains the source-of-truth tool for local and remote D1 access.

```sh
# List tables
bunx wrangler d1 execute ks --local --config apps/play/wrangler.jsonc \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Recent matches, with readable local time
bunx wrangler d1 execute ks --local --config apps/play/wrangler.jsonc \
  --command "SELECT match_id, game_key, status, datetime(created_at / 1000, 'unixepoch', 'localtime') AS created_at FROM matches ORDER BY created_at DESC LIMIT 20;"

# Archived protocols
bunx wrangler d1 execute ks --local --config apps/play/wrangler.jsonc \
  --command "SELECT match_id, source_latest_seq, protocol_version, datetime(created_at / 1000, 'unixepoch', 'localtime') AS archived_at FROM match_protocol_archives ORDER BY created_at DESC LIMIT 20;"

# Compact JSON, useful with jq
bunx wrangler d1 execute ks --local --config apps/play/wrangler.jsonc --json \
  --command "SELECT * FROM matches ORDER BY created_at DESC LIMIT 20;" | jq '.[0].results'
```

Replace `--local` with `--remote` only when intentionally inspecting or changing remote D1. `wrangler d1 execute` is not read-only: review commands containing `INSERT`, `UPDATE`, `DELETE`, or DDL before running them.

## Change the D1 schema

1. Edit `packages/application/src/d1/schema.ts`.
2. Generate, but do not apply, the SQL:

   ```sh
   bunx drizzle-kit generate --config d1/drizzle.config.ts --name <short-name>
   ```

3. Review the new `d1/migrations/<timestamp>_<name>/migration.sql` and snapshot.
4. Check migration history:

   ```sh
   bunx drizzle-kit check --config d1/drizzle.config.ts
   bunx wrangler d1 migrations list ks --local --config apps/play/wrangler.jsonc
   ```

5. Apply locally and verify:

   ```sh
   bun run db:migrate:local
   bun run db:seed:local # optional after the first seed
   ```

6. Applying remote migrations is a separate, explicit operation:

   ```sh
   bunx wrangler d1 migrations list ks --remote --config apps/play/wrangler.jsonc
   bunx wrangler d1 migrations apply ks --remote --config apps/play/wrangler.jsonc
   ```

Use `drizzle-kit generate` plus Wrangler apply. Do not use `drizzle-kit push` or `drizzle-kit migrate` for D1 in this repository; they bypass the reviewed Cloudflare migration workflow.

## Change the MatchRoom SQLite schema

1. Edit `do/match-room/src/storage/schema.ts`.
2. Generate SQL:

   ```sh
   bunx drizzle-kit generate --config do/match-room/drizzle.config.ts --name <short-name>
   ```

3. Review the generated SQL and snapshot under `do/match-room/drizzle/`.
4. Add the generated SQL import and migration key to `do/match-room/drizzle/migrations.js`. The object runtime consumes this explicit bundle.
5. Run `bun run check` and `bun run build`; the dry-run MatchRoom build proves the SQL files are bundled as text.

The Wrangler `migrations` entry in `do/match-room/wrangler.jsonc` creates or renames Durable Object classes. It is not the SQL migration history inside each object's SQLite database.

## Reset local D1

Local data is disposable during the current pre-deployment migration work:

```sh
rm -rf apps/play/.wrangler/state/v3/d1
bun run db:migrate:local
bun run db:seed:local
```

Stop the dev server before deleting its state, then restart it after the reset. This resets D1 only; MatchRoom Durable Object SQLite has a separate local state lifecycle.
