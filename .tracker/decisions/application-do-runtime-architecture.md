# Application and MatchRoom Runtime Architecture

## Status

Accepted target architecture. R2 and historical frontend-asset retention remain a separate decision.

## Expected Value

- **V1 — Replaceable presentation:** React Router and React become replaceable adapters rather than owners of match use cases or persistence.
- **V2 — Isolated deployments:** Play and MatchRoom build and deploy independently; neither deployable imports the other's implementation, and the DO bundle contains no React Router server build.
- **V3 — Local active-match writes:** Ordinary scoring commits only to the match's strongly consistent SQLite-backed DO, removing synchronous D1 fact duplication from the hot path.
- **V4 — Definite completion:** A terminal match is archived idempotently in D1, disconnected, and deleted from DO storage so it stops accruing storage and live-connection duration costs.
- **V5 — Efficient live delivery:** The DO continues to own ordered fan-out, while a final hibernatable WebSocket transport lets it leave memory between score updates.
- **V6 — Independently testable logic:** Framework-neutral orchestration lives behind a small `@ks/application` interface; low-level SQL, RPC, stream, and HTTP details remain private adapters.
- **V7 — Explicit database lifecycles:** Drizzle gives D1 and per-object SQLite separate canonical schemas and migration workflows without turning migrations into a package.
- **V8 — Less package ceremony:** UI code with one consumer returns to Play instead of retaining an independent package lifecycle.

## Ownership

| Owner             | Responsibilities                                                                                                                                          | Must not own                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/play`       | React UI, RR loaders/actions, cookies/authentication, request parsing, redirects and HTTP responses                                                       | SQL, raw DO protocols, match policy, sequencing                                                  |
| `@ks/application` | Use cases, application DTOs, private D1/Drizzle adapters, active-vs-finished read routing, MatchRoom client adapter, cross-store completion orchestration | React/RR types, `Response` construction, gameplay rules, DO-local transport or storage internals |
| `do/match-room`   | Per-match command serialization, active fact journal/projections, command authorization, live clients, local terminal disposal                            | Play/application imports, visual presentation, D1 queries or global catalog policy               |
| D1                | Player directory, global match catalog, completed-match archive                                                                                           | Authoritative active fact journal or hot projections                                             |
| MatchRoom SQLite  | Active configuration, control credential, accepted facts, sequence/deduplication state, recoverable projections                                           | Global lookup and completed history                                                              |

`@ks/application` exposes deep use cases, not generic repositories. Its `match-catalog`, `player-directory`, and completed-archive query modules stay private. MatchRoom returns framework-neutral finalized facts through its RPC contract and never imports application, Play, or D1 modules. The application tells MatchRoom to dispose a finalizing object but does not know how its live clients or SQLite storage are implemented.

## Target Shape

```text
apps/play/                         React Router/React Worker
  web/{routes,components,server}/
  workers/app.ts

do/match-room/                     independently deployed Worker + DO
  src/{worker.ts,MatchRoom.ts}/
  src/{live,storage}/
  drizzle/                         bundled per-object migrations

packages/application/
  src/use-cases/
  src/d1/schema.ts                 canonical global D1 schema
  src/d1/*                         private query implementation

d1/
  drizzle.config.ts
  migrations/                      generated operational assets
  seeds/
```

`do/*` participates in the Bun workspace as a deployable workspace, not as shared package logic. `packages/ui` is merged into `apps/play/web/components`.

Play binds D1 and the external MatchRoom namespace by `script_name`. MatchRoom itself does not bind D1. A later public live gateway may need catalog access at the Worker edge, but that concern remains outside the Durable Object class.

The project had not been deployed before this extraction, so its first deployment intentionally starts with a clean SQLite-backed MatchRoom namespace. Play owns no Durable Object migration or class export. No old local Durable Object storage is carried forward, and no remote deletion or transfer migration is needed because no legacy remote namespace exists.

First-deployment order:

1. Deploy `ks-match-room`; its `new_sqlite_classes` migration creates the namespace.
2. Deploy Play with its `script_name: "ks-match-room"` binding only after the MatchRoom deployment succeeds.
3. Verify create, snapshot, command, and live replay through the deployed pair.

## Persistence and Completion

An active match is authoritative in MatchRoom SQLite. D1 holds enough catalog data to discover it, hydrate global participant data, and distinguish active from finished matches. Active reads combine D1 metadata with a DO snapshot; finished reads use D1 only and must not invoke the deleted DO.

Accepted facts pass through one internal commit seam that persists sequence/deduplication state, updates projections, and then broadcasts. Initialization and command-derived facts must not retain unrelated append paths with different lifecycle side effects.

`match.ended` is terminal. The application coordinates the cross-store workflow while MatchRoom owns its local transaction and disposal:

```text
DO SQLite transaction: append terminal fact + mark finalizing
  -> return finalized facts to @ks/application
  -> application: idempotent D1 archive + catalog finalizing marker
  -> application asks MatchRoom to dispose
       -> broadcast terminal fact
       -> close live clients and clear transport resources
       -> ctx.storage.deleteAll()
  -> application marks the D1 catalog finished
```

The final facts are sufficient to derive both persisted projections: versioned protocol rows and the finished match snapshot. The snapshot is materialized in D1 for finished score-page reads; it is not another active source of truth.

If D1 archival fails, the object stays `finalizing`, rejects gameplay commands, and returns its finalized facts for a synchronous retry on a later relevant request. If execution stops after archival but before deletion is acknowledged, D1's finalizing marker makes a later read retry idempotent DO disposal before marking the catalog finished. Without alarms, cleanup after a runtime failure necessarily depends on such a request; the normal path deletes immediately. Finished reads use D1 only. There is no correction window in this design.

## Live Transport

The DO owns replay and live fan-out. A browser cannot address a DO directly, so the MatchRoom deployment exposes a tiny same-origin gateway Worker route and forwards the connection to the selected object. React Router does not implement or inspect the live response.

Extraction first preserves SSE. The final transport slice replaces it with the hibernatable WebSocket protocol specified in `../match-live-websocket-spec.md`. Commands remain HTTP/RPC; the socket is a server-to-browser notification channel only.
