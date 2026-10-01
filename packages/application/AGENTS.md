# Application

This file describes how application is implemented. Use the repository architecture map to decide whether a task belongs here; use this file after that decision.

## Purpose And Public Surface

- `@ks/application` is the framework-independent domain and behavior layer used by Play. Play owns HTTP parsing, cookies, redirects, and the UI framework.
- Application consumes core, gameplay, and competition and owns D1 access, player-operated workflows, active-versus-finished source selection, and cross-store finalization. MatchRoom remains the active/finalizing execution authority.
- `src/index.ts` is the browser-safe public surface: the `Application` type and re-exported contracts. Do not expose storage classes, internal records, or runtime server dependencies here.
- `src/server.ts`, exported as `@ks/application/server`, composes the D1 client, storage classes, Clock, and private typed MatchRoom capability. Only this composition root constructs production storage classes; tests may construct them against disposable D1.

## Module Layout

- Module folder names are singular: `player`, `match`, and `sparring`. Only `index.ts` and `server.ts` live directly under `src`.
- `contract.ts` defines a module's shared inputs, results, and boundary schemas.
- Workflow code owns orchestration, lifecycle routing, and locale-aware presentation. `sparring/sparring-application.ts` declares its dependency types once and receives structural store capabilities, not concrete storage instances it constructs itself.
- Sparring workflows live in `create-match.ts`, `read-match.ts`, `list-matches.ts`, `submit-command.ts`, and `admit-live.ts`. Each exported workflow takes `(deps: SparringDependencies, ...args)`. Keep single-file helpers unexported below the workflows; export only what another file imports. Pure Sparring projections live in `projections.ts`, and listing rules stay in `list-matches.ts`, not the contract.
- `createSparringApplication` returns an object literal mapping contract methods to workflows, without a class, `this`, or binding. Only `server.ts` and test fixtures call it; workflow tests go through this composition in their existing per-workflow files.
- Projections are pure functions derived from domain values or validated records. Player participant presentation belongs to `player`; Protocol and last-command projections belong to `match`, independently of Sparring Match workflows.
- Each module's `storage/records.ts` defines records independently of Drizzle and maps rows to records. Storage classes with native `#` members own queries and writes; only their methods run D1 queries. Codecs accept values, never database clients.
- `src/d1/schema.ts` owns all D1 tables shared by modules; `src/d1/client.ts` owns client construction and its private database type.
- Modules use other modules' contracts and pure functions, not their concrete storage at runtime. Workflow dependency declarations may import storage classes type-only. The storage exception is `sparring/storage`: joined list reads may use player tables from `d1/schema.ts` and `participantRecordFromRow` from `player/storage/records.ts`. Return participant records and format names in application, without per-player list queries.

## Storage Vocabulary And Boundary

- **Row** means the Drizzle/D1 representation, including raw JSON columns. Row and insert types derive from the shared D1 schema.
- **Record** means a validated storage value after JSON parsing and field mapping, such as `MatchRecord` or `ProtocolArchiveRecord`; its definition does not derive from Drizzle.
- **Domain value** means values owned by core, gameplay, or competition, such as `MatchCommand`, `MatchState`, and `ProtocolEntry`.
- `read*` returns records, `find*` returns nullable lookups, and `list*` returns collections. Private `select*` helpers return raw rows. Name row mappers `*FromRow`.
- Raw JSON columns and parsing never leave a module's `storage/`. Validate persisted rows and JSON on reads; do not reparse trusted typed internal MatchRoom RPC values.
- Keep writes beside the insert or update that owns them. Archive versioning, semantic retry equality, and archive errors live together in `sparring/storage/protocol-archive.ts`.
- Finished reads use D1 without selecting the retained MatchRoom. Missing or corrupt authority and invalid lifecycle calls throw; expected RPC outcomes remain semantic variants for Play to adapt to HTTP.
- Application returns expected failures as `{ ok: false, reason }` domain outcomes, never HTTP statuses or error strings. Play maps reasons to HTTP or presentation in exhaustive switches with a `never` check. Missing finished archives, archive corruption, and unsupported archive versions are defects that throw, not domain failures.

## D1 Tooling And Checks

- Run `bun run db:generate`, `bun run db:migrate:local`, `bun run db:seed:local`, and `bun run db:studio:local` from `packages/application`, or use `bun run --cwd packages/application <script>` from the repository root.
- Drizzle configuration uses package-relative paths: `./src/d1/schema.ts` and `./drizzle`. Migrations live in `drizzle/`; the local player seed lives in `seeds/local-players.sql`.
- Local Wrangler scripts use `../../apps/play/wrangler.jsonc` and Play's `apps/play/.wrangler/state`. Studio opens that same local D1 database and can mutate it.
- From this package, validate migration history with `bunx drizzle-kit check --config drizzle.config.ts`. Follow `.tracker/db.md` for schema changes; do not rewrite applied SQL or hand-format generated snapshots.
- Workerd integration tests stay under `test/`; run `bun run --filter '@ks/application' test:integration` for storage and composition boundaries. Keep workflow unit tests beside their workflow. Use the root gates according to root `AGENTS.md` without rerunning overlapping checks on unchanged code.
