# Application

This file describes how application is implemented. Use the repository architecture map to decide whether a task belongs here; use this file after that decision.

## Purpose And Public Surface

- `@ks/application` is the framework-independent domain and behavior layer used by Play. Play owns HTTP parsing, cookies, redirects, and the UI framework.
- Application consumes core, gameplay, and competition and owns D1 access, player-operated workflows, active-versus-finished source selection, and cross-store finalization. MatchRoom remains the active/finalizing execution authority.
- `src/index.ts` is the browser-safe public contract surface. Do not expose service tags, storage classes, internal records, or runtime server dependencies here.
- `src/server.ts`, exported as `@ks/application/server`, exports `SparringService` and `applicationLayer`. Composition provides native Drizzle Effect D1, storage, calendar Clock, creation generators, and MatchRoom RPC privately; its output contains only public services. Play builds a fresh scoped context per request so clocks and bindings cannot leak, keeping the Scope open through the gateway or Router handler. Tests may build storage layers against disposable D1.

## Module Layout

- Module folder names are singular: `player`, `match`, and `sparring`. Only `index.ts` and `server.ts` live directly under `src`.
- `contract.ts` defines a module's shared inputs, results, and boundary schemas.
- Schema contracts export Effect v4 schema values only; use `typeof Contract.Type` for their readonly decoded types. Non-schema and generic relationships retain named type exports. Use stripping `Schema.Struct` at D1/JSON boundaries and retain upstream checks when extending creation input with `mapFields(..., { unsafePreserveChecks: true })`.
- Workflow code owns orchestration, lifecycle routing, and locale-aware presentation. Dependencies are private `Context.Service` capabilities supplied by layers, not an argument bag.
- Sparring use cases live in `create-match.ts`, `read-match.ts`, `list-matches.ts`, `submit-command.ts`, and `admit-live.ts`. Each module exports a constructor Effect that resolves its dependencies once and returns a method group. Use named `Effect.fn` generators for use-case methods taking business arguments; keep helpers in the same closure when they share resolved dependencies. Pure Sparring projections live in `projections.ts`, and listing rules stay in `list-matches.ts`, not the contract.
- `SparringService.make` composes those method groups directly; public methods need no remaining environment, forwarding wrappers, or per-call context binding. Preserve generic game-key relationships with explicit annotations where inference needs them. Do not add tags/layers per method group, an `Application` namespace, or a Promise facade. Play owns the request-bound `Effect.runPromiseWith(context)` bridge named `runEffect`; workflow fixtures may retain Promise conveniences over the actual service for existing unit tests.
- Projections are pure functions derived from domain values or validated records. Player participant presentation belongs to `player`; Protocol and last-command projections belong to `match`, independently of Sparring Match workflows.
- Each module's `storage/records.ts` defines records independently of Drizzle and maps rows to records. Storage services capture the database and any Clock when their layer is built; their Effect methods require no remaining environment. Only storage methods run D1 queries. Codecs accept values, never database clients.
- `src/d1/schema.ts` owns all D1 tables shared by modules; `src/d1/client.ts` owns the private `ApplicationDatabase` service and its binding-backed layer.
- Workflows consume other modules' service tags, contracts, and pure functions without constructing concrete implementations. Storage stays private to application. The joined-read exception is `sparring/storage`: it may use player tables from `d1/schema.ts` and `participantRecordFromRow` from `player/storage/records.ts`. Return participant records and format names in application, without per-player list queries.

## Effect Integration

- `ApplicationDatabase` is consumed while building storage layers, not exposed to use cases. Method constructors retrieve the same request's registered services, not new instances. Do not build a runtime/layer or retrieve dependencies inside each use-case method when construction can capture them.
- MatchRoom RPC uses `Effect.promise(async () => room.method(...))`: the async callback flattens Cloudflare's Promise/RpcStub result types while preserving rejected promises as defects. Do not add response schemas, unsafe casts, or invented transport error variants.
- Derive private capability and fixture types from MatchRoom methods. If an inferred export leaks an unexported upstream type (TS2883), annotate the relevant function or constructor with that derived capability type; do not export MatchRoom internals or duplicate its DTOs to appease declaration inference.
- Preserve Control versus Protocol generic relationships. The selected RPC determines the read shape; archive callbacks must conform rather than widen it. `NoInfer` on an archive callback's result can keep constructor inference from widening the selected RPC to the combined union.
- Use `Match.tagsExhaustive` for complete tagged-result adaptation. `Predicate.isTagged` is useful for simple guards, but its structural refinement may not exclude every imported union member in later branches; use exhaustive matching rather than casts or unreachable-case fallbacks.
- Unschema-backed application values use `Data.taggedEnum`; expected failures use `Data.TaggedError` in `sparring/errors.ts`. Test-only room constructors derive from the private RPC contract. Assert public tags with literal expectations such as `toHaveProperty('_tag', 'accepted')`, independently of the constructor used by the implementation; also check payloads, lifecycle ordering, and absence of RPC-only fields when relevant. `Effect.flip` tests the typed failure channel without mistaking a defect for an expected failure.
- The pinned Bun patch for `drizzle-orm` bridges its Effect adapter to stable v4. On adapter upgrades, inspect `patches/drizzle-orm@1.0.0-rc.4.patch` and verify both module formats and real Workerd queries before removing it. `D1Client.layer({ db })` currently exposes `Config.ConfigError` in its upstream type even for a concrete binding; preserve that channel rather than adding recovery or erasing it.

## Storage Vocabulary And Boundary

- **Row** means the Drizzle/D1 representation, including raw JSON columns. Row and insert types derive from the shared D1 schema.
- **Record** means a validated storage value after JSON parsing and field mapping, such as `MatchRecord` or `ProtocolArchiveRecord`; its definition does not derive from Drizzle.
- **Domain value** means values owned by core, gameplay, or competition, such as `MatchCommand`, `MatchState`, and `ProtocolEntry`.
- `read*` returns records, `find*` returns nullable lookups, and `list*` returns collections. Private `select*` helpers return raw rows. Name row mappers `*FromRow`.
- Raw JSON columns and parsing never leave a module's `storage/`. Validate persisted rows and JSON on reads; do not reparse trusted typed internal MatchRoom RPC values.
- Keep writes beside the insert or update that owns them. Archive versioning, semantic retry equality, and archive errors live together in `sparring/storage/protocol-archive.ts`.
- Finished reads use D1 without selecting the retained MatchRoom. Missing or corrupt authority and invalid lifecycle calls throw; expected RPC outcomes are adapted into public successes or typed domain failures.
- Sparring methods return successful data directly and expected failures through Effect's typed error channel, never `ok` envelopes, HTTP statuses, or presentation strings. Play's runner requires all typed failures adapted with `Effect.catchTags` before execution and throws Router Responses outside the Effect; defects are not caught as domain outcomes. MatchRoom's persisted `accepted | rejected` receipts remain unchanged; application command success is `{ acceptedSeq }`, and rejection fails with `MatchCommandRejected` carrying the original domain reason. Missing finished archives, archive corruption, and unsupported archive versions remain defects.
- Exposed storage methods normalize native `EffectDrizzleQueryError` failures once to `ApplicationStorageError`, retaining the original cause for diagnostics. Private SQL helpers retain native errors; Play reports generic HTTP 500 without disclosing SQL details. MatchRoom Promise rejections and invariant/codec throws remain defects; do not invent transport failure variants. Finalization logs the failing stage and Cause without recovery. A later submission uses the existing idempotent archival path; no automatic retry is added.

## D1 Tooling And Checks

- Run `bun run db:generate`, `bun run db:migrate:local`, `bun run db:seed:local`, and `bun run db:studio:local` from `packages/application`, or use `bun run --cwd packages/application <script>` from the repository root.
- Drizzle configuration uses package-relative paths: `./src/d1/schema.ts` and `./drizzle`. Migrations live in `drizzle/`; the local player seed lives in `seeds/local-players.sql`.
- Local Wrangler scripts use `../../apps/play/wrangler.jsonc` and Play's `apps/play/.wrangler/state`. Studio opens that same local D1 database and can mutate it.
- From this package, validate migration history with `bunx drizzle-kit check --config drizzle.config.ts`. Follow `.tracker/db.md` for schema changes; do not rewrite applied SQL or hand-format generated snapshots.
- Workerd integration tests stay under `test/`; run `bun run --filter '@ks/application' test:integration` for storage and composition boundaries. Keep workflow unit tests beside their workflow. Use the root gates according to root `AGENTS.md` without rerunning overlapping checks on unchanged code.
