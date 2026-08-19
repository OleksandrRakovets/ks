# Application and MatchRoom Migration Plan

Execute these slices in order. Before each slice, read `decisions/application-do-runtime-architecture.md`, inspect the current code rather than trusting old paths, preserve unrelated worktree changes, and stop for review after completing the slice. Do not deploy, migrate remote data, or delete a namespace without explicit approval.

Every slice must run focused tests plus `bun run check`. Report both factual verification and which value IDs from the architecture document were actually demonstrated; file movement alone is not value evidence.

## 1. Introduce the application seam without changing behavior

- Create `@ks/application` with typed use cases for create/list/read/command/protocol flows.
- Move global D1 query behavior behind private application modules. Temporary narrow operations may preserve MatchRoom's existing D1 writes until Slice 5.
- Add a production factory that accepts Cloudflare bindings and returns the application interface. Give RR routes that interface, not raw `DB`/`MATCH_ROOM` bindings.
- Return typed results/DTOs; loaders/actions alone construct `Response`, redirects, and route errors.
- Characterize current match-creation and command behavior before moving it.

**Proof:** route modules contain no SQL or DO stub calls; application tests cover create and command orchestration; existing behavior remains green. Demonstrates V1 and V6.

## 2. Merge the single-consumer UI package into Play

- Move `@ks/ui` components/styles into `apps/play/web/components/ui` using existing Play conventions.
- Update imports and dependency ownership, then remove the workspace package and obsolete build configuration.
- Do not redesign components or styles in this slice.

**Proof:** Play renders/builds unchanged and no `@ks/ui` reference remains. Demonstrates V8.

## 3. Extract MatchRoom into an independent deployable

- Add `do/*` to the workspace and create `do/match-room` with its own package, Wrangler config, generated types, checks, and tests.
- Move MatchRoom and its private runtime modules there. The host Worker should initially expose only the minimum entrypoint needed to host the class.
- Bind Play to the external namespace with `script_name`; do not runtime-import the class into Play.
- Use a new `new_sqlite_classes` class/namespace. Establish a reviewed cutover plan before touching any deployed legacy namespace; preserve or deliberately discard existing data only with explicit approval.
- Configure local multi-Worker development and document deploy order: MatchRoom before Play when introducing/changing the external binding.

**Proof:** build both deployables; Play output contains neither `MatchRoom` nor its implementation, and MatchRoom output contains no React/RR server code. RPC contract tests pass across the binding. Demonstrates V2.

## 4. Adopt Drizzle for global D1

- Pin the same exact latest release-candidate version of `drizzle-orm` and `drizzle-kit` in the workspace catalog; recheck the canonical RC at execution time.
- Define the canonical D1 schema in `packages/application/src/d1/schema.ts` and convert private D1 adapters to `drizzle-orm/d1`.
- Put Drizzle configuration and generated operational migrations under root `d1/`; both Workers keep bindings to the same database.
- Preserve the existing D1 migration history. Prove an adoption/baseline strategy against a disposable copy before replacing or applying migrations; never manufacture a green migration by resetting remote state.

**Proof:** application adapter integration tests run against local D1, generated SQL is reviewed, and a fresh local database plus an existing-schema copy both reach the expected schema. Demonstrates V7 and preserves V6.

## 5. Make MatchRoom SQLite authoritative while active

- Define a separate DO Drizzle schema and generated migration bundle under `do/match-room`; initialize `drizzle-orm/durable-sqlite` with `ctx.storage` and migrate inside `blockConcurrencyWhile`.
- Persist active config/control credential, accepted facts, latest sequence, and deduplication state locally. Derive or persist projections only where recovery measurements justify it.
- Unify initialized and command-derived facts behind one internal accepted-fact commit seam.
- Serve snapshot and replay from DO SQLite. Remove ordinary fact/snapshot writes to D1 and obsolete temporary application operations.
- Extract low-level live client/encoding bookkeeping into a private broadcaster while retaining SSE behavior.

**Proof:** restart/reconstruction, duplicate-command, ordering, replay, and concurrent-command tests pass; an ordinary score command performs no D1 write. Demonstrates V3, V6, and V7.

## 6. Implement terminal archival and immediate deletion

- Add a private, idempotent completed-match archive operation inside `@ks/application` using its D1 schema/query modules.
- On accepted `match.ended`, transactionally append it and mark `finalizing`; reject subsequent gameplay commands.
- Return finalized facts to the application, which derives the finished snapshot and protocol rows and idempotently writes the archive plus D1 catalog finalizing marker.
- After archival, the application asks MatchRoom to dispose locally: broadcast the terminal fact, close all SSE clients, clear every timer, and call `ctx.storage.deleteAll()`. Only then does the application mark the D1 catalog finished. MatchRoom must not import application or bind D1.
- On archive failure, retain local finalizing state and allow synchronous retry; do not broadcast completion or delete storage. If execution stops later, application reads must reconcile either local finalizing state or a D1 finalizing marker, retry idempotent DO cleanup, and mark the catalog finished; no alarm is introduced.
- Route finished snapshots/protocol reads to D1 so they never recreate the deleted DO. Finalizing reads may return the completed archive while driving cleanup. Unknown/finished live requests must not leave an empty migrated object behind.

**Proof:** tests inject failure before archive, before deletion, and before the final catalog transition; each retry converges to one archive, empty DO storage, and a finished catalog. Also verify no post-terminal commands/writes and that all streams close. Demonstrates V4.

## 7. Move the SSE gateway out of React Router

- Give the MatchRoom Worker one public, same-origin, path-specific live route; reject all unrelated public requests.
- Validate method, match ID, cursor, and access policy before forwarding the request verbatim to the selected DO.
- Configure the route to be more specific than Play's catch-all route. Remove the RR SSE loader only after production-equivalent and local routing are covered.
- Keep the SSE wire behavior unchanged in this slice.

**Proof:** browser-to-DO replay/live/cancellation tests pass through the gateway; Play no longer handles the live request; streaming remains unbuffered. Demonstrates V1, V2, and prepares V5.

## 8. Replace SSE with hibernatable WebSockets

Implement `match-live-websocket-spec.md` as an isolated behavior change. Remove SSE streams, controllers, ping intervals, and old schemas only after compatibility tests pass.

**Proof:** protocol, cursor/replay, reconnection, terminal-close, malformed-message, and hibernation-reconstruction tests pass; MatchRoom has no timer or in-memory client set after a handler returns. Demonstrates V5 and completes V4.

After the final accepted slice, update `decisions/current-architecture.md` to describe the implementation rather than this target plan.
