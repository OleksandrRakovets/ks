# Application

This file describes how application is implemented. Use the repository architecture map to decide whether a task belongs here; use this file after that decision.

## Purpose And Public Surface

- `@ks/application` is the framework-independent domain and behavior layer used by Play. Play owns HTTP parsing, cookies, redirects, and the UI framework.
- Application consumes core, gameplay, and competition and owns D1 access, player-operated workflows, active-versus-finished source selection, and cross-store finalization. MatchRoom remains the active/finalizing execution authority.
- `src/index.ts` is the browser-safe public surface: the `Application` type and re-exported contracts. Do not expose storage classes, internal records, or runtime server dependencies here.
- `src/server.ts`, exported as `@ks/application/server`, builds private Effect service layers for native Drizzle Effect D1, storage, Clock, creation generators, and MatchRoom RPC. `createApplication` requires a Scope; Play keeps it open through the gateway or Router handler. Build a fresh context per request so clocks and bindings cannot leak between requests. Tests may build storage layers against disposable D1.

## Module Layout

- Module folder names are singular: `player`, `match`, and `sparring`. Only `index.ts` and `server.ts` live directly under `src`.
- `contract.ts` defines a module's shared inputs, results, and boundary schemas.
- Workflow code owns orchestration, lifecycle routing, and locale-aware presentation. Dependencies are private `Context.Service` capabilities supplied by layers, not an argument bag.
- Sparring workflows live in `create-match.ts`, `read-match.ts`, `list-matches.ts`, `submit-command.ts`, and `admit-live.ts`. Exported workflows use named `Effect.fn` generators taking business arguments; yield required services from context. Keep single-file helpers unexported below the workflows; export only what another file imports. Pure Sparring projections live in `projections.ts`, and listing rules stay in `list-matches.ts`, not the contract.
- `createSparringApplication` maps the existing Promise contract to workflows through one `Effect.runPromiseWith(context)` bridge; it does not build or dispose resources. Only `server.ts` and test fixtures call it; workflow tests go through this composition in their existing per-workflow files.
- Projections are pure functions derived from domain values or validated records. Player participant presentation belongs to `player`; Protocol and last-command projections belong to `match`, independently of Sparring Match workflows.
- Each module's `storage/records.ts` defines records independently of Drizzle and maps rows to records. Storage services capture the database and any Clock when their layer is built; their Effect methods require no remaining environment. Only storage methods run D1 queries. Codecs accept values, never database clients.
- `src/d1/schema.ts` owns all D1 tables shared by modules; `src/d1/client.ts` owns the private `ApplicationDatabase` service and its binding-backed layer.
- Workflows consume other modules' service tags, contracts, and pure functions without constructing concrete implementations. Storage stays private to application. The joined-read exception is `sparring/storage`: it may use player tables from `d1/schema.ts` and `participantRecordFromRow` from `player/storage/records.ts`. Return participant records and format names in application, without per-player list queries.

## Storage Vocabulary And Boundary

- **Row** means the Drizzle/D1 representation, including raw JSON columns. Row and insert types derive from the shared D1 schema.
- **Record** means a validated storage value after JSON parsing and field mapping, such as `MatchRecord` or `ProtocolArchiveRecord`; its definition does not derive from Drizzle.
- **Domain value** means values owned by core, gameplay, or competition, such as `MatchCommand`, `MatchState`, and `ProtocolEntry`.
- `read*` returns records, `find*` returns nullable lookups, and `list*` returns collections. Private `select*` helpers return raw rows. Name row mappers `*FromRow`.
- Raw JSON columns and parsing never leave a module's `storage/`. Validate persisted rows and JSON on reads; do not reparse trusted typed internal MatchRoom RPC values.
- Keep writes beside the insert or update that owns them. Archive versioning, semantic retry equality, and archive errors live together in `sparring/storage/protocol-archive.ts`.
- Finished reads use D1 without selecting the retained MatchRoom. Missing or corrupt authority and invalid lifecycle calls throw; expected RPC outcomes remain semantic variants for Play to adapt to HTTP.
- Application returns expected failures as `{ ok: false, reason }` domain outcomes, never HTTP statuses or error strings. Play maps reasons to HTTP or presentation in exhaustive switches with a `never` check. Missing finished archives, archive corruption, and unsupported archive versions are defects that throw, not domain failures.
- Native D1 query errors remain `EffectDrizzleQueryError` failures. MatchRoom Promise rejections and invariant/codec throws remain defects; do not invent transport failure variants. Finalization logs the failing stage and Cause without recovery. A later submission uses the existing idempotent archival path; no automatic retry is added.

## D1 Tooling And Checks

- Run `bun run db:generate`, `bun run db:migrate:local`, `bun run db:seed:local`, and `bun run db:studio:local` from `packages/application`, or use `bun run --cwd packages/application <script>` from the repository root.
- Drizzle configuration uses package-relative paths: `./src/d1/schema.ts` and `./drizzle`. Migrations live in `drizzle/`; the local player seed lives in `seeds/local-players.sql`.
- Local Wrangler scripts use `../../apps/play/wrangler.jsonc` and Play's `apps/play/.wrangler/state`. Studio opens that same local D1 database and can mutate it.
- From this package, validate migration history with `bunx drizzle-kit check --config drizzle.config.ts`. Follow `.tracker/db.md` for schema changes; do not rewrite applied SQL or hand-format generated snapshots.
- Workerd integration tests stay under `test/`; run `bun run --filter '@ks/application' test:integration` for storage and composition boundaries. Keep workflow unit tests beside their workflow. Use the root gates according to root `AGENTS.md` without rerunning overlapping checks on unchanged code.
