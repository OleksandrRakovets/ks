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

| Owner             | Responsibilities                                                                                                                   | Must not own                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/play`       | React UI, RR loaders/actions, cookies/authentication, request parsing, redirects and HTTP responses                                | SQL, raw DO protocols, match policy, sequencing                                                |
| `@ks/application` | Use cases, application DTOs, private D1/Drizzle adapters, active-vs-finished read routing, MatchRoom client adapter                | React/RR types, `Response` construction, gameplay rules, DO lifecycle ordering                 |
| `do/match-room`   | Per-match command serialization, active fact journal/projections, command authorization, live clients, terminal lifecycle ordering | Play imports, visual presentation, global catalog queries beyond narrow application operations |
| D1                | Player directory, global match catalog, completed-match archive                                                                    | Authoritative active fact journal or hot projections                                           |
| MatchRoom SQLite  | Active configuration, control credential, accepted facts, sequence/deduplication state, recoverable projections                    | Global lookup and completed history                                                            |

`@ks/application` exports deep operations, not generic repositories. Its `match-catalog`, `player-directory`, and completed-archive query modules stay private. MatchRoom may import a narrow operation such as `@ks/application/archive-completed-match`; it never imports from Play or imports D1 tables directly.

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

Both Workers bind the same D1 database because both need capabilities implemented by `@ks/application`. Play binds the external MatchRoom namespace by `script_name`; MatchRoom is created as a new SQLite-backed class/namespace because the existing `new_classes` backend cannot be converted in place.

## Persistence and Completion

An active match is authoritative in MatchRoom SQLite. D1 holds enough catalog data to discover it, hydrate global participant data, and distinguish active from finished matches. Active reads combine D1 metadata with a DO snapshot; finished reads use D1 only and must not invoke the deleted DO.

Accepted facts pass through one internal commit seam that persists sequence/deduplication state, updates projections, and then broadcasts. Initialization and command-derived facts must not retain unrelated append paths with different lifecycle side effects.

`match.ended` is terminal:

```text
DO SQLite transaction: append terminal fact + mark finalizing
  -> @ks/application archive operation: idempotent D1 archive + catalog finalizing marker
  -> broadcast terminal fact
  -> close live clients and clear transport resources
  -> ctx.storage.deleteAll()
  -> mark the D1 catalog finished
```

If D1 archival fails, the object stays `finalizing`, rejects gameplay commands, and retries synchronously on a later relevant request. If execution stops after archival but before deletion is acknowledged, D1's finalizing marker makes a later read retry idempotent DO cleanup before marking the catalog finished. Without alarms, cleanup after a runtime failure necessarily depends on such a request; the normal path deletes immediately. Finished reads use D1 only. There is no correction window in this design.

## Live Transport

The DO owns replay and live fan-out. A browser cannot address a DO directly, so the MatchRoom deployment exposes a tiny same-origin gateway Worker route and forwards the connection to the selected object. React Router does not implement or inspect the live response.

Extraction first preserves SSE. The final transport slice replaces it with the hibernatable WebSocket protocol specified in `../match-live-websocket-spec.md`. Commands remain HTTP/RPC; the socket is a server-to-browser notification channel only.
