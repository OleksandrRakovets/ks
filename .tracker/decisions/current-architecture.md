# Current Architecture

## Status

This is the implemented source architecture after the application/MatchRoom refactor. The project has not yet been deployed, so there is no legacy remote namespace or database to preserve.

The remaining live-transport work is intentionally separate: `.tracker/match-live-websocket-spec.md` owns both moving the SSE gateway out of React Router and replacing SSE with hibernatable WebSockets. Historical migration slices and target-state documents have been removed.

## What the refactor established

- **Replaceable presentation:** React Router receives a framework-neutral `Application`; route modules no longer issue SQL or call Durable Object stubs.
- **Independent runtime builds:** Play and MatchRoom are separate Cloudflare Worker deployables. MatchRoom's bundle contains no React Router server build, and Play does not runtime-import MatchRoom's implementation.
- **Local active writes:** an active match commits its fact journal and command receipts only to its strongly consistent per-object SQLite database.
- **Definite completion:** terminal facts are archived in D1, live clients are closed, and MatchRoom storage is deleted immediately.
- **Testable orchestration:** creation, active/finished read routing, commands, and cross-store finalization can be tested through application dependencies without React Router or a live Cloudflare runtime.
- **Explicit database lifecycles:** D1 and MatchRoom SQLite have separate Drizzle schemas and migration workflows. Migrations are operational assets, not packages.
- **Less package ceremony:** the single-consumer UI package was merged into Play.

## Runtime Shape

```text
Browser
  -> Play Worker (React Router/React)
       -> @ks/application
            -> D1 (global catalog, players, completed archive)
            -> external MATCH_ROOM binding
                 -> ks-match-room Worker / named MatchRoom DO
                      -> one SQLite database per active match
                      -> current SSE broadcaster
```

There are two independently built deployables:

- `apps/play` owns the browser UI, HTTP adaptation, and application composition.
- `do/match-room` hosts the `MatchRoom` Durable Object. Its Worker entrypoint currently has no public `fetch` route; Play reaches named objects through an external Durable Object binding.

Play's type-only import of `@ks/match-room` lets Wrangler derive `DurableObjectNamespace<MatchRoom>` and RPC method types. TypeScript erases that import. The application package does not depend on the MatchRoom package: its private adapter accepts the structural stub shape supplied by the generated binding.

## Ownership

| Owner             | Owns                                                                                                                                               | Does not own                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/play`       | React UI and local UI components, RR loaders/actions, request parsing, forms/cookies, redirects, `Response`/route errors, Worker composition       | SQL, gameplay policy, DO storage or sequencing                            |
| `@ks/application` | Public use cases/DTOs, private D1/Drizzle adapters, MatchRoom RPC adapter, active-vs-finished read routing, terminal cross-store orchestration     | React components, route types, gameplay rules, DO SQLite/live bookkeeping |
| `do/match-room`   | Per-match command serialization, active fact journal, sequence and command deduplication, projections/cache, SSE replay/fan-out, terminal disposal | Play/application imports, D1 queries, global player/catalog policy        |
| D1                | Players, global match catalog/lifecycle, completed snapshot and versioned protocol archive                                                         | Active fact journal and command receipts                                  |
| MatchRoom SQLite  | Active config, reserved control secret, accepted facts, latest integer sequence, command receipts, active/finalizing state                         | Global lookup, player records, completed history                          |

`@ks/application` exposes use cases rather than repository interfaces. Its D1 modules and MatchRoom client are private implementation details. The temporary exception to its framework-neutral results is `streamMatchFacts(): Promise<Response>`; it exists only for the current SSE pass-through and is removed by the direct-gateway slice.

## Directory Shape

```text
apps/play/
  workers/app.ts                    Play Worker composition root
  web/routes.ts                     React Router routes
  web/components/ui/                single-consumer visual components

do/match-room/
  src/worker.ts                     independent Worker/DO export
  src/MatchRoom.ts                  public RPC methods and per-object orchestration
  src/storage/{schema,store}.ts     active SQLite schema and persistence seam
  src/live/broadcaster.ts           current low-level SSE bookkeeping
  drizzle/                          generated per-object SQL + explicit bundle

packages/application/
  src/contracts.ts                  public use-case interface and DTOs
  src/use-cases.ts                  framework-neutral orchestration
  src/match-room-client.ts           private structural RPC adapter
  src/d1/                            private global schema and query adapters

d1/
  drizzle.config.ts
  migrations/                       generated global migration assets
  seeds/
```

## Package Boundaries

- `packages/core`
  - shared IDs, contracts, schemas, and generic envelopes only,
  - no runtime or persistence concerns,
  - no dependency on other internal packages.
- `packages/gameplay`
  - pure per-game state and rules,
  - game registry,
  - game command interpretation,
  - game-owned control and display projections,
  - depends on `core`, never on `competition`.
- `packages/competition`
  - storage-agnostic match policy and state derivation,
  - depends on `core` and `gameplay`.
- `packages/application`
  - framework-neutral use-case orchestration and private global persistence/RPC adapters,
  - depends on domain packages and i18n, never on Play or MatchRoom implementation.
- `do/match-room`
  - a deployable workspace, not a shared logic package,
  - consumes domain packages and owns active runtime/storage concerns.
- `apps/play`
  - owns Cloudflare binding composition and presentation adapters,
  - consumes the application interface and domain types needed to render controls.

Core domain direction:

`core <- gameplay <- competition`

Application and MatchRoom independently consume that domain direction; Play sits at the outer edge.

## Game Integration Rules

- Game keys come from the central registry.
- Shared app code should consume game projections, not game internals.
- Keep one consistent game command path based on `game.command` with game-specific payloads.
- Competition owns generic match lifecycle; MatchRoom owns serialized persistence sequence.
- Game implementations own game semantics, control projection, and public display projection.

## Persistence Rules

- D1 and MatchRoom SQLite are separate schemas with separate lifecycles. Their canonical definitions are `packages/application/src/d1/schema.ts` and `do/match-room/src/storage/schema.ts`.
- Active accepted facts are the match source of truth and exist only in MatchRoom SQLite. `seq` is an explicit monotonic integer assigned by the serialized DO commit; ULID fact IDs identify facts but do not replace cursor/order semantics.
- Active snapshots and control projections are derived from local facts and may be cached in memory. They are not mirrored to D1.
- D1 keeps stable cross-game catalog/player fields relational. Protocol rows and the finished snapshot are materialized as validated JSON in the completed archive.
- Final facts are sufficient to derive both finished representations. Persisting the snapshot avoids replay and a deleted-DO call on finished score-page reads; it is not another active source of truth.
- Keep game-specific or policy-specific variability in JSON. Normalize more only for a real lookup, reporting, or integrity need.
- See `../db.md` for migration, reset, query, and Drizzle Studio commands.

## Call Stacks

### Match creation

```text
RR action parses form
  -> application.createMatch
       -> resolve/create guest players in D1
       -> insert D1 catalog row as creating
       -> MatchRoom.create over RPC
            -> transactionally persist active config + initial facts in DO SQLite
       -> mark D1 catalog row active
  -> RR redirects to the match page
```

Creation generates a control secret and stores it with the active match, but does not return it to the browser. No command path currently checks it; ownership and invite-link authorization remain future product work.

### Active read and protocol

```text
RR loader -> application.readMatch
  -> read catalog + participants from D1
  -> read active snapshot/control projections from MatchRoom

RR protocol loader -> application.readMatchProtocol
  -> active: read facts from MatchRoom and derive localized protocol rows
  -> finished: read the versioned protocol archive from D1 only
```

The match list reads D1 catalog/participants only. It does not currently display live scores; that would require an explicit D1 summary projection or querying active rooms, not an accidental return to active fact mirroring.

### Score command

```text
RR action validates command
  -> application.commandMatch verifies D1 lifecycle
       -> named MatchRoom.facts RPC
            -> serialize command handling
            -> deduplicate by commandId/request payload
            -> derive domain facts
            -> transactionally append facts + receipt + latest seq in DO SQLite
            -> broadcast each committed non-terminal fact
       -> return accepted seq/fact IDs
```

An ordinary score command performs no D1 write.

### Terminal completion

`match.ended` is terminal and is committed together with MatchRoom's `finalizing` state. Later gameplay commands are rejected. The terminal fact is deliberately withheld from live clients until archival succeeds:

```text
DO SQLite transaction: append match.ended + mark finalizing
  -> return finalization facts to @ks/application
  -> derive and idempotently write D1 protocol + snapshot archive
     and mark catalog finalizing
  -> application calls MatchRoom.disposeFinalized
       -> broadcast match.ended
       -> close all live clients and clear timers
       -> ctx.storage.deleteAll()
  -> application marks D1 catalog finished
```

If archival fails, MatchRoom remains `finalizing`, retains its facts, sends no terminal event, and rejects further commands. If execution stops later, application reads observe either the DO or D1 `finalizing` state and synchronously retry the idempotent remaining steps. There is no alarm or correction grace window. Cleanup after an interrupted request therefore waits for a later relevant request; the normal path deletes immediately.

Finished snapshot/protocol reads use D1 only and do not select the deleted room. D1 list entries collapse `finalizing` to the public `finished` status while driving cleanup.

## Current Live Path

```text
Browser EventSource
  -> Play RR loader /api/m/:matchId/stream/
  -> application validates D1 lifecycle and passes through Response
  -> MatchRoom.stream RPC
  -> SSE ready event + fact replay + live fact broadcasts
```

The browser validates SSE payloads, tracks the latest sequence, closes its `EventSource` when it processes `match.ended`, and revalidates the page. React effect cleanup also closes the stream. MatchRoom still broadcasts the terminal fact before closing all server-side controllers, so client cooperation is helpful but not required for disposal.

The private broadcaster correctly removes cancelled streams and clears 25-second ping intervals. Its in-memory controller set and timers keep the DO active for the lifetime of connected SSE clients. That follows Cloudflare's normal streaming rules; it simply cannot benefit from Durable Object hibernation. The remaining two-stage transport change is specified in `../match-live-websocket-spec.md`.

## Deployment and Development

- Play binds D1 and the external `ks-match-room` namespace using `script_name`; MatchRoom itself has no D1 binding.
- Both Workers currently use compatibility date `2026-08-11`; no legacy Node.js compatibility flag is required.
- The first deployment order is MatchRoom, then Play, then an end-to-end create/read/command/live check.
- `bun run dev` starts normal combined development through Play. Each deployable also has its own build/typecheck scripts.
- Do not add location hints or regional constraints before measuring deployed latency. Treat Worker, DO, and D1 placement as independent.

## Active Match UI

- Active match controls optimize for fast table-top scoring on an iPhone 16-class vertical screen.
- Use the dedicated `control` button size for live scoring commands instead of globally enlarging ordinary app buttons.
- Keep visible active-match text at 16px or larger unless it is screen-reader-only.
- Preserve centered neutral actions when centering carries meaning; avoid full-width neutral controls by default.
- Do not show command-tier labels such as Primary, Secondary, or Tertiary in the scoring surface.

## Validation And Schemas

- Standardize schema imports on `valibot`.
- Shared schemas originate in `packages/core`.
- Client-side validation is helpful, but server-side validation is mandatory.
- Drizzle owns TypeScript database schemas and generated SQL. D1 and per-object SQLite never share a migration history.

## Guardrails

- Do not place domain rules directly in route files.
- Do not expose raw D1/MatchRoom bindings through route context.
- Do not make MatchRoom import application or D1 modules.
- Do not mirror active facts to D1 without a concrete read-model requirement.
- Do not select a finished match's deleted DO for snapshots or protocol reads.
- Do not let app code infer behavior from hardcoded game keys.
- Do not keep generic helpers that secretly encode Pyramid assumptions as shared truth.
- Do not normalize game internals prematurely.
- Do not let competition or referee concerns leak into core game reducers unless they are true game semantics.

## Deferred By Design

- the direct live gateway and hibernatable WebSocket protocol are the next runtime slices, but are deliberately paused,
- ownership/invite authorization will eventually use server-side ownership mappings; the reserved control secret alone is not authorization,
- guest/session-based access control and managed scoreboards remain later product milestones,
- historical hashed frontend assets/R2 deployment policy is a separate decision,
- additional storage normalization should follow real lookup/stat/reporting screens.
