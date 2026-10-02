# Current Architecture

## Runtime

```text
Browser
  -> Play Worker (React Router and React)
       -> @ks/application
            -> D1
            -> internal MATCH_ROOM binding
                 -> named MatchRoom Durable Object
                      -> per-match SQLite
```

Play owns HTTP and presentation adaptation. `@ks/application/server` exposes the current player-operated use cases through `SparringService`; browser-safe contracts remain in `@ks/application`. Application owns use-case orchestration, private D1 access, active-versus-finished read routing, and cross-store finalization. MatchRoom owns serialized active-match execution, SQLite checkpoints and Protocol, and hibernatable WebSocket fan-out.

Application use cases run as Effect v4 programs over private service tags and layers. `applicationLayer` supplies the binding-backed Drizzle Effect D1 client, storage services, calendar Clock, creation generators, and typed MatchRoom capability privately. Focused method-group constructors capture those dependencies once and compose directly into `SparringService`; its methods need no remaining environment. Each Play request builds a fresh scoped context containing only public services and binds `Effect.runPromiseWith(context)` as `runEffect`. The Scope stays open until the gateway or Router handler returns, and routes execute `SparringService.use(...)` through that bridge. Sparring methods return successful data directly and expected failures in the typed error channel. Storage normalizes SQL failures to `ApplicationStorageError` with the native cause retained; Play maps these to generic HTTP 500. Routes adapt typed failures with `Effect.catchTags` before execution; `RunEffect` requires an error channel of `never`, and Router Responses are thrown afterward. RPC rejections, persisted-data corruption, and invariant violations remain defects. MatchRoom retains persisted `accepted | rejected` receipts; application command success is `{ acceptedSeq }`, and rejection fails with `MatchCommandRejected` carrying the domain reason. Pure projections and synchronous XState/gameplay execution are unchanged.

Play is the single Cloudflare Worker deployable and exports the MatchRoom class from the separate `@ks/match-room` workspace. MatchRoom has no public route or D1 dependency; its `fetch` method serves only WebSocket handshakes forwarded to a selected object by Play. Application imports `@ks/match-room` type-only to derive its private capability, while Play imports the class at runtime only from its Worker entrypoint. The generated internal binding verifies that the selected RPC stub is structurally compatible.

Colocation accepts one larger bundle and a shared deployment lifecycle. Local startup profiling did not establish a MatchRoom cold-start benefit from a separate Worker, while one Worker removes cross-deployment compatibility, local registry orchestration, and branch-preview namespace coupling. A Play deployment can restart MatchRooms and close their sockets. Deployments therefore require zero live Matches and completed finalization/archival, not just compatibility of gameplay or checkpoint changes.

## Domain Boundaries

The domain dependency direction is:

```text
core <- gameplay <- competition
```

- `core` defines shared IDs, schemas, seats, Protocol values, and generic contracts.
- `gameplay` defines registered games, frame machines, commands, and coherent derivation of separate game presentation and flat controls.
- `competition` defines match lifecycle, execution, restoration, and room projection.
- `application` and MatchRoom consume the domain independently. Application has only a type-only dependency on MatchRoom for its private RPC capability.

Game keys come from `packages/gameplay/src/registry.ts`. Each game has an explicit primary Match route and Protocol route. The primary route loader maps the application lifecycle once to the mutually exclusive Control or Result page; the stable URL does not encode lifecycle state. Commands share the `game` path, while gameplay owns their semantics.

Competition composes match controls before game controls into one flat list. MatchRoom exposes distinct scoring and Protocol read contracts; application preserves them, and Play alone groups scoring controls into stable presentation sections for layout. MatchRoom RPC is a trusted typed capability and does not reparse these values at that seam.

Play's match pages share Active and Finished surface compositions with their corresponding Protocol pages.
Application projects checked identity, targets, authoritative frame wins and winner, and the frame identified
by the current index, including awarded and finished frames. Match reads add Controls or indexed frame/rack
Result scores and rematch configuration; Protocol reads add only Protocol rows and active game presentation.
Full Match State and Game Result remain internal to room transfers and archives. Feature-local presentation
functions derive header copy, board emphasis, and Result labels; the Shell and Board render resolved props.
Page controllers own submission and live revalidation using identity, lifecycle, and the acceptance cursor.

### Schema Conventions

- Boundary schemas use Effect v4 Schema; do not add a `Schema` suffix. Schemas export only the schema value, with consumers inferring `typeof Contract.Type` directly or through a local alias. Contracts without schemas and generic relationships keep named type exports. IDs and epoch milliseconds use native phantom brands without changing their serialized representations.
- Domain values such as commands, Protocol entries, game state, and projections are readonly. Construction may use mutable locals, with readonly established at the validated or returned boundary rather than through extra copying.
- Use non-empty tuple schemas when non-emptiness is part of the domain contract. Core `StrictStruct` checks keys before Struct decoding for closed variants; plain Struct strips extra properties at persisted, wire, and browser-storage boundaries where forward compatibility is intentional. Schema parse options apply globally to nested decoding, not through schema annotations. Schema replacement preserves optional/default behavior, tuple trailing-element stripping where supported, cross-field checks, and persisted JSON.

## Data Authority

| Store | Authority |
| --- | --- |
| D1 | Players, creating/active/finished match rows, final protocol archive and final match state, compact finished list-score projection |
| MatchRoom SQLite | Active config, control secret, Accepted Commands and outcomes, monotonic acceptance sequence, complete Protocol entries, immutable executable aggregate checkpoints, compact score projection, active/finalizing status |

Accepted Commands and their outcomes are the immutable acceptance ledger and are never mirrored to D1. MatchRoom uses checkpoint-based request-local execution and does not replay Accepted Commands on reads. See `do/match-room/AGENTS.md` for its storage and restoration mechanics.

Finished match-state and Protocol reads use D1 only. While D1 remains active but MatchRoom is finalizing, match pages and live-list scores display the room's finished projection without changing D1. Application archives MatchRoom's transferred final state and Protocol without gameplay replay. When D1 marks the Match finished, it also stores the Accepted Command cursor and a compact score projection on the Match row so list reads do not parse the Protocol archive. This projection is reproducible from Final Match State and is not a second history authority.

## Match Lifecycle

Creation is coordinated by application:

```text
D1 matches.status: creating
  -> MatchRoom.initialize persists config and the prepared first-frame checkpoint at sequence 0
  -> D1 matches.status: active
```

The match machine automatically passes through transient `between-frames` into `frame-in-progress` on creation and
non-final frame completion. Gameplay remains uncommenced until a player submits `frame.commence`. Initial preparation
has no Protocol row; subsequent `frame-prepared` entries belong to the preceding frame-ending Accepted Command,
alongside its award. There is no preparation Command, additional acceptance, or additional storage transaction.

Ordinary commands verify the match row's lifecycle, then write only to MatchRoom. `commandId` receipts make retries idempotent and reject reuse with a different canonical request. A valid Command envelope whose nested match/game command is unsupported returns `invalid-command`; malformed browser input remains an expected HTTP failure rather than an RPC exception.

Application selects a named room once with `getByName(matchId)`. Initialization binds the routed Durable Object to that Match and is idempotent; later RPC methods derive identity from the selected room and do not repeat the Match ID.

The `match-ended` Protocol entry is stored with the match-ending Accepted Command atomically with MatchRoom's `finalizing` status. MatchRoom broadcasts the match-ending update and closes sockets immediately after the commit, before archival:

```text
MatchRoom finalizing Protocol + Final Match State; broadcast match-ending update
  -> application checks D1 identity, lifecycle, and archive idempotency before archiving the transfer
  -> idempotently archive protocol and final match state in D1
  -> D1 matches.status: active -> finished, storing endedAt and the compact final score projection
```

Until the final step succeeds, D1 remains active and the retained MatchRoom reports `finalizing`. GETs return the room's final projection without writing. A later POST to that room can retry the idempotent transfer, archival, and D1 finish steps. MatchRoom remains `finalizing` after D1 marks the Match finished; finished D1 reads do not access it.

## Match List Score Reads

The live Match list use case reads Active Matches followed by Matches finished in the last 15
minutes; the finished use case reads only finished Matches started on one selected local calendar
day. The live list has no row cap. `/sparring/matches/finished/:day?/` defaults to the newest
occupied day and reads all finished rows in its UTC day interval; two single-row seeks against the
`(status, created_at, match_id)` index discover adjacent occupied days without scanning empty dates.
The application's Clock timezone defines day boundaries, including DST transitions, and Match ID
breaks ties within a start timestamp. Application reads compact finished scores directly from D1
rows and asks each selected Active MatchRoom for a coherent score and Accepted Command cursor. A room
found finalizing returns its final score and end time without changing D1; the live list presents
the game as finished even while archival remains pending. Only D1-finished rows enter the finished list.
The finished path neither selects MatchRoom nor starts browser polling.

Play exposes `GET /api/sparring-matches/live-scores/` for polling unique Active Match IDs.
Application batch-reads their D1 lifecycle, reads Active MatchRooms in parallel, preserves request
order, and returns replacement score projections rather than command deltas. The live list polls this
endpoint approximately every 30 seconds while it contains Active Matches; the finished list does
not poll.

## Live Updates

```text
Browser WebSocket
  -> Play /api/sparring-match/:matchId/live/ Worker gateway
  -> application transport-neutral D1 admission
  -> selected MatchRoom.fetch WebSocket handshake
  -> caught-up cursor, then committed Accepted Command invalidations
```

The browser validates the versioned shared wire contract and reconnects with bounded backoff. Loader projections remain authoritative: live messages only request revalidation. A connection receives one current cursor rather than replaying individual invalidations. Active Control and Protocol pages also revalidate on returning to a visible or focused tab or receiving an `online` hint, even without a socket update; finished pages remove those listeners. The live list similarly polls on an `online` hint while visible. `offline` does not stop retries or disable controls because browser connectivity estimates do not establish whether Play is reachable.

The match-ending update is broadcast and sockets are closed when its command is accepted, before D1 archival; clients revalidate against either the room's final projection or D1's finished archive. Changing the read source later does not require a second notification. MatchRoom's local guidance documents the Durable Object socket mechanics.

## Persistence Boundaries

- Canonical schemas are `packages/application/src/d1/schema.ts` and `do/match-room/src/storage/schema.ts`.
- Application owns D1 tooling and runtime storage access; Play supplies its D1 binding and deployment configuration. See `packages/application/AGENTS.md` for module organization and storage boundaries.
- D1 and MatchRoom SQLite have independent migration histories and application mechanisms.
- Persisted rows and JSON are decoded and validated at the storage boundary. Malformed data fails the operation rather than yielding partial state.
- Expected RPC outcomes are semantic variants, not HTTP failures. Application adapts them into successful values or typed domain failures, including command rejection, and Play maps failures to HTTP/UI responses. Missing or corrupt authority and invalid lifecycle calls are defects that throw.
- See each component's local guidance for storage mechanics and `.tracker/db.md` for migration and inspection procedures.

## Deployment

Play's Wrangler configuration owns both the Worker deployment and the MatchRoom Durable Object class migration. Production runs at `https://play.ks.ua`.

Deploy only after all live Matches have ended and archival is complete. New Matches use the deployed MatchRoom schema and checkpoint contract; finished reads use D1, so retained rooms do not require historical backfills or checkpoint compatibility routing. D1 changes prefer explicit schema/data migrations over runtime legacy fallbacks. See root `AGENTS.md` for migration communication and compatibility policy, and `.tracker/db.md` for operational procedures.
